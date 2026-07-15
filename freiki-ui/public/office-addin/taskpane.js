/* global Office, Word, fetch */

const API_BASE = ''; // gleicher Origin (app.freiki.com), kein CORS nötig

// Session-Cookie ist HttpOnly, daher /api/me als Server-Rundruf statt lokalem Token.
Office.onReady(async () => {
  try {
    const r = await fetch(`${API_BASE}/api/me`, { cache: 'no-store' });
    if (r.ok) showModeView();
  } catch { /* Login-Ansicht bleibt sichtbar */ }
});

document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('logout-link').addEventListener('click', logout);
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => runMode(btn.dataset.mode));
});
document.getElementById('insert-btn').addEventListener('click', insertResult);

function setStatus(text) { document.getElementById('status').textContent = text || ''; }
function setError(text) { document.getElementById('error').textContent = text || ''; }

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) { setError('Bitte Benutzername und Passwort eingeben.'); return; }
  setError(''); setStatus('Anmeldung läuft…');
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    let data;
    try {
      data = await res.json();
    } catch {
      setError('Server nicht erreichbar (unerwartete Antwort).');
      setStatus('');
      return;
    }
    if (!res.ok || !data.role) {
      setError(data.error || 'Anmeldung fehlgeschlagen.');
      setStatus('');
      return;
    }
    setStatus('');
    showModeView();
  } catch (e) {
    setError('Server nicht erreichbar: ' + e.message);
    setStatus('');
  }
}

function logout() {
  fetch(`${API_BASE}/api/logout`, { method: 'POST' }).catch(() => {});
  document.getElementById('mode-view').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('result-box').style.display = 'none';
  setStatus(''); setError('');
}

function showModeView() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('mode-view').style.display = 'block';
}

async function getSelectedText() {
  return Word.run(async (context) => {
    const range = context.document.getSelection();
    range.load('text');
    await context.sync();
    return range.text;
  });
}

async function runMode(mode) {
  setError(''); document.getElementById('result-box').style.display = 'none';

  let text;
  try {
    text = await getSelectedText();
  } catch (e) {
    setError('Konnte markierten Text nicht lesen: ' + e.message);
    return;
  }
  if (!text || !text.trim()) {
    setError('Bitte zuerst Text im Dokument markieren.');
    return;
  }

  setStatus('FreiKI arbeitet…');
  const formData = new FormData();
  formData.append('message', text);
  formData.append('mode', mode);
  formData.append('history', '[]');

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      body: formData,
    });
    if (res.status === 401) {
      setStatus(''); setError('Sitzung abgelaufen, bitte neu anmelden.');
      logout();
      return;
    }
    if (!res.ok) {
      setStatus(''); setError('Fehler vom Server (' + res.status + ').');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) fullText += delta;
        } catch { /* unvollständiges Chunk ignorieren */ }
      }
    }

    // Qwen3 liefert teils leere <think></think>-Blöcke, die weder gelesen noch eingefügt werden sollen
    fullText = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    setStatus('');
    if (!fullText) {
      setError('Keine Antwort erhalten.');
      return;
    }
    document.getElementById('result-text').value = fullText;
    document.getElementById('result-box').style.display = 'block';
  } catch (e) {
    setStatus(''); setError('Fehler: ' + e.message);
  }
}

async function insertResult() {
  const text = document.getElementById('result-text').value;
  if (!text) return;
  try {
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      range.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
    document.getElementById('result-box').style.display = 'none';
  } catch (e) {
    setError('Konnte Text nicht einfügen: ' + e.message);
  }
}
