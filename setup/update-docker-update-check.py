#!/usr/bin/env python3
"""
Synct die Image-Liste im n8n Docker-Update-Check-Workflow mit docker-compose.yml.
Ausführen nach jeder Änderung an docker-compose.yml die Image-Tags betrifft.

    ssh aiadmin@100.65.167.76 'cat /home/aiadmin/ai-stack/docker-compose.yml' | python3 update-docker-update-check.py
  oder:
    python3 update-docker-update-check.py  (liest docker-compose.yml direkt vom Server)

Benötigt die Umgebungsvariable N8N_API_KEY (n8n-API-Key mit Zugriff auf diesen Workflow):

    N8N_API_KEY=... python3 update-docker-update-check.py
"""
import json, os, re, sys, subprocess, urllib.request, urllib.error

API = "http://100.65.167.76:5678/api/v1/workflows/3MtYJZv4jDxJxC44"
KEY = os.environ.get("N8N_API_KEY")
if not KEY:
    sys.exit("Fehler: Umgebungsvariable N8N_API_KEY nicht gesetzt.")

# GitHub-Repo-Mapping — nur hier pflegen wenn ein neues Image dazukommt
GITHUB_MAP = {
    "portainer/portainer-ee":                  {"github": "portainer/portainer"},
    "mintplexlabs/anythingllm":                {"github": "Mintplex-Labs/anything-llm"},
    "n8nio/n8n":                               {"github": "n8n-io/n8n"},
    "searxng/searxng":                         {"github": "searxng/searxng", "githubFallback": "commits"},
    "caddy":                                   {"github": "caddyserver/caddy"},
    "amir20/dozzle":                           {"github": "amir20/dozzle"},
    "vllm/vllm-openai":                        {"github": "vllm-project/vllm"},
    "postgres":                                {"github": None, "changelogUrl": "https://www.postgresql.org/docs/release/"},
    "pgvector/pgvector":                       {"github": "pgvector/pgvector"},
    "flowiseai/flowise":                       {"github": "FlowiseAI/Flowise"},
    "onerahmet/openai-whisper-asr-webservice": {"github": "ahmetoner/whisper-asr-webservice"},
}

CREDS = {
    "imap":     {"id": "qYfpLP7iTVXoOldL", "name": "IMAP account"},
    "smtp":     {"id": "4fobl4eiuIUIhgly", "name": "SMTP account"},
    "postgres": {"id": "rPKM947GDxbdGJNV", "name": "Postgres account"},
}
NODE_CRED_TYPE = {
    "n8n-nodes-base.emailReadImap": "imap",
    "n8n-nodes-base.emailSend":     "smtp",
    "n8n-nodes-base.postgres":      "postgres",
}

# docker-compose.yml lesen (stdin oder direkt vom Server)
if not sys.stdin.isatty():
    compose = sys.stdin.read()
else:
    r = subprocess.run(
        ["ssh", "aiadmin@100.65.167.76", "cat /home/aiadmin/ai-stack/docker-compose.yml"],
        capture_output=True, text=True
    )
    compose = r.stdout

# Images parsen
images = []
seen = set()
for line in compose.split('\n'):
    m = re.match(r'\s+image:\s+(.+)', line)
    if not m: continue
    image_str = m.group(1).strip()
    colon = image_str.rfind(':')
    full_repo = image_str[:colon] if colon > 0 else image_str
    tag = image_str[colon+1:] if colon > 0 else 'latest'
    base_repo = full_repo.replace('library/', '')
    map_key = next((k for k in GITHUB_MAP if base_repo == k or base_repo.startswith(k)), None)
    if not map_key or full_repo in seen: continue
    seen.add(full_repo)
    meta = GITHUB_MAP[map_key]
    name = base_repo.split('/')[-1].replace('-', ' ').title()
    hub_repo = full_repo if '/' in full_repo else f'library/{full_repo}'
    images.append({"name": name, "repo": hub_repo, "tag": tag, **meta})
    print(f"  {name}: {hub_repo}:{tag}")

# Aktuellen Workflow holen
req = urllib.request.Request(API, headers={"X-N8N-API-KEY": KEY})
with urllib.request.urlopen(req) as r:
    current = json.loads(r.read())

nodes = current["nodes"]
images_js = json.dumps(images, indent=2, ensure_ascii=False)

# Zweiteilige Pruefung pro Image:
#   1) Digest-Check (wie bisher) -- erkennt, ob der gepinnte Tag heimlich neu gebaut wurde
#   2) Versions-Check (neu, seit 2026-07-09) -- vergleicht den gepinnten Tag per Semver gegen
#      alle auf Docker Hub vorhandenen Tags und erkennt so echte neue Releases, selbst wenn der
#      gepinnte Tag (z.B. "2.25.6") selbst nie neu gebaut wird. Ohne diesen Teil hat der Check das
#      n8n-Sicherheitsupdate 2.25.6 -> 2.29.8 nie gemeldet, siehe Postmortem 2026-07-08/09.
new_js = f"""const IMAGES = {images_js};

function parseSemver(t) {{
  const m = /^v?(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(t || '');
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}}
function cmpSemver(a, b) {{
  for (let i = 0; i < 3; i++) {{ if (a[i] !== b[i]) return a[i] - b[i]; }}
  return 0;
}}

const store = $getWorkflowStaticData('global');
if (!store.docker_digests) store.docker_digests = {{}};

const updates = [];
const checked = [];

for (const img of IMAGES) {{
  let digestChanged = false;
  let newerVersion = null;

  try {{
    const url = 'https://hub.docker.com/v2/repositories/' + img.repo + '/tags/' + img.tag;
    const res = await $helpers.httpRequest({{ method: 'GET', url, timeout: 10000 }});
    const digest = res.digest || res.images?.[0]?.digest || res.last_updated || null;
    const key = img.repo + ':' + img.tag;
    const stored = store.docker_digests[key];
    if (digest) {{
      if (stored && stored !== digest) digestChanged = true;
      store.docker_digests[key] = digest;
    }}
  }} catch (e) {{
    checked.push({{ name: img.name, status: 'Digest-Fehler: ' + e.message }});
    continue;
  }}

  const pinned = parseSemver(img.tag);
  if (pinned) {{
    try {{
      const tagsRes = await $helpers.httpRequest({{
        method: 'GET',
        url: 'https://hub.docker.com/v2/repositories/' + img.repo + '/tags?page_size=100&ordering=last_updated',
        timeout: 15000
      }});
      let best = null;
      for (const r of (tagsRes.results || [])) {{
        const v = parseSemver(r.name);
        if (v && cmpSemver(v, pinned) > 0 && (!best || cmpSemver(v, best) > 0)) best = v;
      }}
      if (best) newerVersion = best.join('.');
    }} catch (e) {{
      checked.push({{ name: img.name, status: 'Versions-Fehler: ' + e.message }});
    }}
  }}

  if (digestChanged || newerVersion) {{
    updates.push({{ ...img, newerVersion, reason: digestChanged && newerVersion ? 'digest+version' : (digestChanged ? 'digest' : 'version') }});
  }}
  checked.push({{ name: img.name, tag: img.tag, newerVersion: newerVersion || '\\u2013', status: newerVersion ? 'NEUE VERSION' : (digestChanged ? 'DIGEST GEAENDERT' : 'aktuell') }});
}}

return [{{ json: {{ updates, count: updates.length, checked }} }}];"""

for n in nodes:
    if n['name'] == 'Docker Images prüfen':
        n['parameters']['jsCode'] = new_js
    ctype = NODE_CRED_TYPE.get(n["type"])
    if ctype:
        n["credentials"] = {ctype: CREDS[ctype]}

payload = json.dumps({
    "name": current["name"],
    "nodes": nodes,
    "connections": current["connections"],
    "settings": {k: v for k, v in current.get("settings", {}).items() if k in {"executionOrder","saveManualExecutions","callerPolicy"}},
    "staticData": current.get("staticData"),
}).encode()

req2 = urllib.request.Request(API, data=payload, headers={"X-N8N-API-KEY": KEY, "Content-Type": "application/json"}, method="PUT")
try:
    with urllib.request.urlopen(req2) as r:
        resp = json.loads(r.read())
        print(f"\n✅ Workflow aktualisiert: {resp.get('updatedAt')}")
except urllib.error.HTTPError as e:
    print(f"❌ Fehler {e.code}: {e.read().decode()[:300]}")
