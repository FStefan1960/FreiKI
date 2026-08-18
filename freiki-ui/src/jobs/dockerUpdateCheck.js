// Ersatz für den n8n-Workflow "Docker Update Check". Liest die gepinnten Image-Tags live aus
// docker-compose.yml (read-only gemountet unter /data/docker-compose.yml, wie zuvor beim
// n8n-Container), vergleicht gegen Docker Hub/GitHub, lässt das LLM eine Zusammenfassung
// schreiben und verschickt einen HTML-Bericht. Digest-Historie liegt jetzt in
// docker-update-state.json statt in n8n's $getWorkflowStaticData (muss Deploys überleben).
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendReportMail } = require('../core/integrations/EmailService');
const users = require('../core/auth/UserRepository');

const COMPOSE_PATH = '/data/docker-compose.yml';
const STATE_PATH = path.join(config.APP_ROOT, 'docker-update-state.json');

const GITHUB_MAP = {
  'portainer/portainer-ee': { name: 'Portainer', github: 'portainer/portainer' },
  'portainer/portainer-ce': { name: 'Portainer', github: 'portainer/portainer' },
  'mintplexlabs/anythingllm': { name: 'AnythingLLM', github: 'Mintplex-Labs/anything-llm' },
  'n8nio/n8n': { name: 'n8n', github: 'n8n-io/n8n' },
  'searxng/searxng': { name: 'SearXNG', github: 'searxng/searxng', githubFallback: 'commits' },
  'caddy': { name: 'Caddy', github: 'caddyserver/caddy' },
  'amir20/dozzle': { name: 'Dozzle', github: 'amir20/dozzle' },
  'vllm/vllm-openai': { name: 'vLLM', github: 'vllm-project/vllm' },
  'pgvector/pgvector': { name: 'pgvector', github: 'pgvector/pgvector' },
  'flowiseai/flowise': { name: 'Flowise', github: 'FlowiseAI/Flowise' },
  'onerahmet/openai-whisper-asr-webservice': { name: 'Whisper', github: 'ahmetoner/whisper-asr-webservice' },
  'ghcr.io/paperless-ngx/paperless-ngx': { name: 'Paperless', github: 'paperless-ngx/paperless-ngx' },
  'mattermost/mattermost-team-edition': { name: 'Mattermost', github: 'mattermost/mattermost' },
  'mattermost/mattermost-enterprise-edition': { name: 'Mattermost', github: 'mattermost/mattermost' },
  'mailserver/docker-mailserver': { name: 'Mailserver', github: 'docker-mailserver/docker-mailserver' },
  'apache/tika': { name: 'Tika', github: 'apache/tika' },
  'ghcr.io/speaches-ai/speaches': { name: 'speaches (TTS)', github: 'speaches-ai/speaches' },
};

// Schliesst Vorab-/instabile Kanaele aus (Nightly-Builds, Snapshots, RCs, ...) - ohne diesen
// Filter wurden z.B. n8ns "v3-nightly" als Version "3" gelesen und faelschlich als neuer als
// das echte 2.30.3 gemeldet.
const UNSTABLE_TAG = /nightly|snapshot|-rc\d*(\.|$|-)|beta|alpha|-dev(\.|$|-)|canary|-edge(\.|$|-)|preview/i;

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { digests: parsed.digests || {} };
  } catch { return { digests: {} }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

function loadImagesFromCompose() {
  const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');
  const images = [];
  const seen = new Set();
  for (const line of compose.split('\n')) {
    const m = line.match(/^\s+image:\s+(.+)$/);
    if (!m) continue;
    // Digest-Pinning ("image:tag@sha256:...") vor dem Tag-Parsing abtrennen, sonst reisst
    // lastIndexOf(':') den Tag mitten im Digest ab (Bug, der schon im n8n-Original steckte).
    const imageStr = m[1].trim().replace(/@sha256:[0-9a-f]+$/, '');
    const colon = imageStr.lastIndexOf(':');
    const rawRepo = colon > 0 ? imageStr.slice(0, colon) : imageStr;
    const tag = colon > 0 ? imageStr.slice(colon + 1) : 'latest';
    const isGhcr = rawRepo.startsWith('ghcr.io/');
    const fullRepo = isGhcr ? rawRepo : rawRepo.replace(/^docker\.io\//, '');
    const baseRepo = fullRepo.replace(/^library\//, '');
    const mapKey = Object.keys(GITHUB_MAP).find(k => baseRepo === k || baseRepo.startsWith(k));
    if (!mapKey || seen.has(fullRepo)) continue;
    seen.add(fullRepo);
    const meta = GITHUB_MAP[mapKey];
    const hubRepo = !isGhcr && !fullRepo.includes('/') ? `library/${fullRepo}` : fullRepo;
    images.push({ name: meta.name, repo: hubRepo, tag, github: meta.github, githubFallback: meta.githubFallback, isGhcr });
  }
  return images;
}

function parseSemver(t) {
  if (!t || UNSTABLE_TAG.test(t)) return null;
  const m = /^v?(\d+(?:\.\d+)*)/.exec(t);
  if (!m) return null;
  return m[1].split('.').map(Number);
}
function cmpSemver(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function ghGet(url) {
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'FreiKI-jobs/1.0', Accept: 'application/vnd.github.v3+json' } }, 10000);
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return r.json();
}

async function findUpdates(images, state) {
  const updates = [];
  for (const img of images) {
    let digestChanged = false;
    let newerVersion = null;

    if (img.isGhcr) {
      const pinned = parseSemver(img.tag);
      if (pinned && img.github) {
        try {
          const releases = await ghGet(`https://api.github.com/repos/${img.github}/releases?per_page=20`);
          let best = null;
          for (const r of (Array.isArray(releases) ? releases : [])) {
            if (r.prerelease || r.draft) continue;
            const v = parseSemver(r.tag_name);
            if (v && cmpSemver(v, pinned) > 0 && (!best || cmpSemver(v, best) > 0)) best = v;
          }
          if (best) newerVersion = best.join('.');
        } catch { /* Versionsvergleich einfach auslassen, kein harter Fehler pro Image */ }
      }
    } else {
      try {
        const res = await fetchWithTimeout(`https://hub.docker.com/v2/repositories/${img.repo}/tags/${img.tag}`, {}, 10000);
        if (res.ok) {
          const data = await res.json();
          const digest = data.digest || data.images?.[0]?.digest || data.last_updated || null;
          const key = `${img.repo}:${img.tag}`;
          if (digest) {
            if (state.digests[key] && state.digests[key] !== digest) digestChanged = true;
            state.digests[key] = digest;
          }
        }
      } catch { /* Digest-Vergleich auslassen bei Fehler */ }

      const pinned = parseSemver(img.tag);
      if (pinned) {
        try {
          const tagsRes = await fetchWithTimeout(`https://hub.docker.com/v2/repositories/${img.repo}/tags?page_size=100&ordering=last_updated`, {}, 15000);
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            let best = null;
            for (const r of (tagsData.results || [])) {
              const v = parseSemver(r.name);
              if (v && cmpSemver(v, pinned) > 0 && (!best || cmpSemver(v, best) > 0)) best = v;
            }
            if (best) newerVersion = best.join('.');
          }
        } catch { /* Versionsvergleich auslassen bei Fehler */ }
      }
    }

    if (digestChanged || newerVersion) updates.push({ ...img, newerVersion });
  }
  return updates;
}

function normalizeTag(t) { return (t || '').replace(/^v/, ''); }

async function loadChangelogs(updates) {
  const result = [];
  for (const img of updates) {
    let notes = 'Keine Changelog-Informationen verfügbar.';
    let latestTag = img.newerVersion || img.tag;

    if (img.github) {
      try {
        const releases = await ghGet(`https://api.github.com/repos/${img.github}/releases?per_page=5`);
        if (Array.isArray(releases) && releases.length > 0) {
          const ghTag = releases[0].tag_name;
          latestTag = img.newerVersion || (ghTag && normalizeTag(ghTag) !== normalizeTag(img.tag) ? ghTag : img.tag);
          notes = releases.slice(0, 3).map(r => {
            const date = r.published_at?.slice(0, 10) || '?';
            const body = (r.body || 'Keine Release Notes').replace(/<!--.*?-->/gs, '').replace(/#{1,6}\s/g, '').trim().slice(0, 800);
            return `Version ${r.tag_name} (${date}):\n${body}`;
          }).join('\n\n---\n\n');
        } else if (img.githubFallback === 'commits') {
          const commits = await ghGet(`https://api.github.com/repos/${img.github}/commits?per_page=10`);
          const tags = await ghGet(`https://api.github.com/repos/${img.github}/tags?per_page=1`);
          latestTag = tags[0]?.name || '–';
          if (Array.isArray(commits) && commits.length > 0) {
            notes = 'Letzte Änderungen (Commits):\n' + commits.map(c => {
              const date = c.commit.author?.date?.slice(0, 10) || '?';
              const msg = c.commit.message.split('\n')[0].slice(0, 120);
              return `• ${date}: ${msg}`;
            }).join('\n');
          }
        }
      } catch (e) {
        notes = `Changelog nicht abrufbar: ${e.message}`;
      }
    }
    result.push({ name: img.name, repo: img.repo, tag: img.tag, github: img.github, latestTag, newerVersion: img.newerVersion, notes });
  }
  return result;
}

async function summarize(updates) {
  const promptParts = updates.map(r => `## ${r.name} (${r.repo}:${r.tag})\nNeuste Version: ${r.latestTag}\n\n${r.notes}`).join('\n\n════════════\n\n');
  const prompt = `Du bist ein IT-Administrator-Assistent.
Folgende Docker-Images haben Updates erhalten. Fasse für jeden die wichtigsten Änderungen in 2–3 Sätzen zusammen.
Bewerte kurz ob ein Update dringend (Sicherheitslücke), empfohlen (wichtige Fixes) oder optional (neue Features) ist.
Weise explizit auf Breaking Changes hin falls vorhanden.
Schreibe auf Deutsch, ohne Markdown-Formatierung, keine Codeblöcke.

${promptParts}

/no_think`;

  const thinkingKwargs = /qwen/i.test(config.VLLM_MODEL || '') ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({ model: config.VLLM_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.3, ...thinkingKwargs }),
  }, 120000);
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
  const data = await r.json();
  let text = (data.choices?.[0]?.message?.content || '').trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return text || '(Keine KI-Zusammenfassung verfügbar)';
}

function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (/^-{3,}$/.test(line)) { closeList(); html += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0;">'; continue; }
    let m;
    if ((m = /^#{2,4}\s+(.*)$/.exec(line))) { closeList(); html += `<h3 style="font-size:14px;color:#1E3A8A;margin:14px 0 6px;">${inline(m[1])}</h3>`; continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      if (!inList) { html += '<ul style="margin:4px 0 8px;padding-left:20px;">'; inList = true; }
      html += `<li style="font-size:13px;color:#374151;margin-bottom:4px;">${inline(m[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p style="margin:0 0 8px;font-size:13px;color:#374151;">${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function buildReport(updates, zusammenfassung) {
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const th = t => `<th style="padding:8px 12px;background:#1E3A8A;color:#fff;font-size:12px;font-weight:600;text-align:left;">${t}</th>`;
  const td = (t, bg = '#fff') => `<td style="padding:7px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;background:${bg};">${t}</td>`;
  const rows = updates.map((u, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr>${td(`<strong>${u.name}</strong>`, bg)}${td(`${u.repo}:${u.tag}`, bg)}${td(u.newerVersion || u.latestTag || '–', bg)}</tr>`;
  }).join('');
  const table = `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;margin-bottom:20px;"><thead><tr>${th('Service')}${th('Image')}${th('Neue Version')}</tr></thead><tbody>${rows}</tbody></table>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0e0f0f;">
  <div style="background:linear-gradient(135deg,#1E3A8A,#2B9CD8);padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:20px;">🐳 Docker Update-Bericht</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${datum} – ${updates.length} Update(s) verfügbar</p>
  </div>
  <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;">
    <h2 style="font-size:15px;color:#1E3A8A;border-bottom:2px solid #bfdbfe;padding-bottom:6px;margin:0 0 12px;">Verfügbare Updates</h2>
    ${table}
    <h2 style="font-size:15px;color:#1E3A8A;border-bottom:2px solid #bfdbfe;padding-bottom:6px;margin:20px 0 12px;">Was ist neu?</h2>
    <div style="background:#f8fafc;border-left:4px solid #2B9CD8;padding:14px 16px;border-radius:4px;">${mdToHtml(zusammenfassung)}</div>
    <div style="margin-top:20px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:12px;color:#713f12;"><strong>Hinweis:</strong> Updates bitte manuell durchführen und vorher testen. Nach dem Pull: <code>docker compose up -d [service]</code></p>
    </div>
  </div>
  <div style="background:#f8fafc;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;text-align:center;">Automatisch generiert</div>
</div>`;
  return { html, subject: `🐳 ${updates.length} Docker-Update(s) verfügbar – ${datum}` };
}

async function run() {
  const state = loadState();
  const images = loadImagesFromCompose();
  const updates = await findUpdates(images, state);
  saveState(state);
  if (!updates.length) return;

  const withChangelogs = await loadChangelogs(updates);
  const zusammenfassung = await summarize(withChangelogs);
  const { html, subject } = buildReport(withChangelogs, zusammenfassung);

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, subject, { html });
}

module.exports = { run };
