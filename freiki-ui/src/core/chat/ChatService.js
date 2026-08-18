const fs = require('fs');
const { config } = require('../../shared/config');
const { normArea } = require('../../shared/utils/text');
const prompts = require('./PromptService');
const chatRepo = require('./ChatRepository');
const sensitiveLog = require('../audit/SensitiveQueryLog');
const documents = require('../documents/DocumentService');
const users = require('../auth/UserRepository');
const { webSearch } = require('../integrations/SearXNGService');
const { recordChatEvent } = require('../../jobs/usageStatsReport');
const { handleImageGenMode, handleQrGenMode } = require('./MediaGenChatMode');
const { handlePaperlessMode } = require('./PaperlessChatMode');
const { handleWissenMode } = require('./WissenChatMode');
const { handleDirectMode } = require('./DirectChatMode');

async function handleChat(req, res) {
  const { message, mode, history, multidoc_task } = req.body;
  const modeConf = prompts.findMode(mode);
  const isMulti = modeConf?.multifile || false;
  const file = req.files?.['file']?.[0] || null;
  const files = req.files?.['files'] || [];

  console.log(`Chat request - mode: ${mode}, file: ${file ? file.originalname : 'none'}, files: ${files.length}, task: ${multidoc_task || 'none'}`);
  chatRepo.trackChatRequest(req.session?.uid);

  try {
    let fileContent = '';
    let isOcr = false;

    if (file) {
      console.log(`Verarbeite Datei: ${file.originalname}`);
      try {
        const result = await documents.extractForChat(file);
        fileContent = result.text;
        isOcr = result.isOcr;
        console.log(`Extrahiert: ${fileContent.length} Zeichen${isOcr ? ' (OCR)' : ''}`);
      } catch (readErr) {
        console.error('Datei-Lesefehler:', readErr);
        fileContent = `[Fehler beim Lesen der Datei: ${readErr.message}]`;
      }
      fs.unlinkSync(file.path);

      if (fileContent.length > config.MAX_CONTEXT_CHARS) {
        console.log(`Datei gekürzt von ${fileContent.length} auf ${config.MAX_CONTEXT_CHARS} Zeichen`);
        fileContent = fileContent.substring(0, config.MAX_CONTEXT_CHARS) +
          `\n\n[... Text gekürzt – Original hatte ${Math.round(file.size / 1024)}KB ...]`;
      }
    }

    // ── Mehrfachdokumente (multidoc-Modus) ──
    if (isMulti && files.length > 0) {
      const parts = await documents.extractForMultidoc(files);
      fileContent = parts.map(p => `=== Dokument: ${p.filename} ===\n${p.text}`).join('\n\n');
      if (fileContent.length > config.MAX_CONTEXT_CHARS_MULTI) {
        fileContent = fileContent.substring(0, config.MAX_CONTEXT_CHARS_MULTI) +
          '\n\n[... weitere Dokumente gekürzt ...]';
      }
    }

    const useWebSearch = modeConf?.websearch || false;
    const isPaperless  = modeConf?.paperless || false;
    const isImageGen   = modeConf?.imagegen || false;
    const isQrGen      = modeConf?.qrgen || false;
    const wissenKey    = mode.startsWith('w_') ? mode.slice(2) : mode;
    const isWissen     = modeConf?.workspace === 'wissen';
    // Session-Username ist die Quelle der Wahrheit (JWT). req.body.username ist nur Fallback
    // für alte Clients: der 15-Minuten-Health-Check sendet JSON ohne username-Feld und
    // landete sonst als "unknown" – genau die Werte, die der Nutzungsbericht herausfiltert.
    const username = req.session?.username || req.body.username || 'unknown';

    // Bereiche, auf die der Nutzer laut use_areas Zugriff hat (null = uneingeschränkt/admin).
    // Live aus der DB gelesen (nicht aus dem JWT), da use_areas sich seit dem Login geändert
    // haben kann; gleiche Logik wie /api/modes und answerBotChat.
    let allowedAreaKeys = null;
    let liveRow = null;
    const needsLiveAreas = isWissen && req.session?.uid && req.session.role !== 'admin';
    if (needsLiveAreas) {
      try {
        liveRow = await users.findLiveAreasById(req.session.uid);
        const liveUse = liveRow?.use_areas || [];
        if ((req.session.role === 'default' || req.session.role === 'high_risk' || req.session.role === 'manager') && liveUse.length) {
          allowedAreaKeys = liveUse.map(normArea);
        }
      } catch (e) {
        console.warn('use_areas konnten nicht geladen werden:', e.message);
      }
    }
    if (isWissen && allowedAreaKeys && !allowedAreaKeys.includes(normArea(wissenKey))) {
      return res.status(403).json({ error: 'Kein Zugriff auf diesen Wissensbereich' });
    }

    // Antwortsprache des Nutzers - live aus der DB, aus demselben Grund wie allowedAreaKeys
    // oben (ein Admin kann die Sprache ändern, ohne dass sich der Nutzer neu einloggen muss).
    // Nicht bei Übersetzen/Bildgenerierung/QR-Code angewendet - diese Modi haben entweder
    // schon eine eigene Sprachlogik (Übersetzen) oder erzeugen keinen Fließtext.
    // liveRow (falls oben schon geladen) bringt language gleich mit - spart im Wissen-Modus
    // einen zweiten Roundtrip zu findLiveLanguageById().
    let userLanguage = 'de';
    if (liveRow) {
      userLanguage = liveRow.language || 'de';
    } else if (req.session?.uid) {
      try { userLanguage = await users.findLiveLanguageById(req.session.uid); }
      catch (e) { console.warn('Sprache konnte nicht geladen werden:', e.message); }
    }

    recordChatEvent({
      user: username, mode, title: modeConf?.title || mode,
      hasFile: !!file, timestamp: new Date().toISOString()
    });

    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });

    let userMessage = message || '';
    if (fileContent) {
      if (isMulti) {
        const taskLabel = multidoc_task === 'vergleichen'
          ? `Vergleiche die folgenden Dokumente präzise und detailliert. Gehe dabei so vor:
1. Erstelle eine Tabelle mit den wichtigsten Regelungen/Inhalten als Zeilen und den Dokumenten als Spalten – markiere Unterschiede deutlich.
2. Liste danach konkrete wörtliche Unterschiede auf: Was steht in Dokument A, was in Dokument B? Zitiere direkt aus den Texten.
3. Benenne Widersprüche, Lücken und Gemeinsamkeiten explizit.
Sei so konkret wie möglich – keine allgemeinen Aussagen.`
          : 'Fasse die folgenden Dokumente zusammen. Erstelle zuerst eine Kurzzusammenfassung je Dokument, dann einen übergreifenden Überblick mit den wichtigsten gemeinsamen Themen und Erkenntnissen.';
        userMessage = `${taskLabel}${userMessage ? '\n\nZusätzliche Anweisung: ' + userMessage : ''}\n\n${fileContent}`;
      } else {
        userMessage = userMessage
          ? `${userMessage}\n\n--- Dateiinhalt ---\n${fileContent}`
          : `Bitte verarbeite folgenden Inhalt:\n\n${fileContent}`;
      }
    }

    // Prüft Nachricht + ggf. zusammengeführten Dateiinhalt (OCR/MultiDoc) -- bewusst NACH dem
    // Zusammenführen, nicht auf dem rohen "message"-Feld, sonst wird bei Zusammenfassen/MultiDoc
    // nur die kurze Anweisung geprüft statt des eigentlichen Dokumentinhalts.
    sensitiveLog.checkAndLog(req.session, 'chat', userMessage);

    if (useWebSearch && !fileContent && userMessage) {
      console.log('Starte Web-Suche...');
      const searchResults = await webSearch(userMessage);
      if (searchResults) {
        userMessage = `${userMessage}\n\n--- Aktuelle Web-Suchergebnisse ---\n${searchResults}\n\nBitte beantworte die Frage auf Basis dieser Ergebnisse.`;
        console.log(`Web-Suche: ${config.SEARXNG_RESULTS} Ergebnisse gefunden`);
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    if (isOcr && fileContent) {
      const ocrBlock = `**Erkannter Text (OCR):**\n\`\`\`\n${fileContent}\n\`\`\`\n\n---\n\n`;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ocrBlock } }] })}\n\n`);
    }

    if (isPaperless) {
      await handlePaperlessMode(res, message);
    } else if (isImageGen) {
      await handleImageGenMode(res, message);
    } else if (isQrGen) {
      await handleQrGenMode(res, message);
    } else if (isWissen) {
      await handleWissenMode(res, { wissenKey, userMessage, history, mode, allowedAreaKeys, userLanguage });
    } else {
      await handleDirectMode(res, { userMessage, history, mode, isMulti, now, hasFileContent: !!fileContent, userLanguage });
    }
  } catch (e) {
    console.error('Chat error:', e);
    if (!res.headersSent) {
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Interner Fehler' });
    }
  }
}

module.exports = { handleChat };
