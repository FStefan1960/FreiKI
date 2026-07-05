const fetch = require('node-fetch');
const { config } = require('../../shared/config');

function authHeader() {
  return { 'Authorization': `Token ${config.PAPERLESS_TOKEN}` };
}

async function getMeta() {
  const [tagsRes, corrRes, typesRes] = await Promise.all([
    fetch(`${config.PAPERLESS_INTERNAL_URL}/api/tags/?page_size=200`, { headers: authHeader() }),
    fetch(`${config.PAPERLESS_INTERNAL_URL}/api/correspondents/?page_size=200`, { headers: authHeader() }),
    fetch(`${config.PAPERLESS_INTERNAL_URL}/api/document_types/?page_size=200`, { headers: authHeader() }),
  ]);
  const [tagsData, corrData, typesData] = await Promise.all([
    tagsRes.json(), corrRes.json(), typesRes.json()
  ]);
  return {
    tags:          (tagsData.results  || []).map(t => ({ id: t.id, name: t.name })),
    correspondents:(corrData.results  || []).map(c => ({ id: c.id, name: c.name })),
    document_types:(typesData.results || []).map(d => ({ id: d.id, name: d.name })),
  };
}

async function getDocument(id) {
  const plRes = await fetch(`${config.PAPERLESS_INTERNAL_URL}/api/documents/${id}/`, { headers: authHeader() });
  if (!plRes.ok) return null;
  const d = await plRes.json();
  return {
    id:            d.id,
    title:         d.title,
    content:       d.content || '',
    created:       d.created_date || d.created || '',
    correspondent: d.correspondent_name || null,
    document_type: d.document_type_name || null,
  };
}

// Gibt { ok, status, contentType, filename, body } zurück; body ist der node-fetch Response-Stream.
async function downloadDocument(id) {
  const metaRes = await fetch(`${config.PAPERLESS_INTERNAL_URL}/api/documents/${id}/`, { headers: authHeader() });
  if (!metaRes.ok) return { ok: false, status: 404 };
  const meta = await metaRes.json();
  const dlRes = await fetch(`${config.PAPERLESS_INTERNAL_URL}/api/documents/${id}/download/`, { headers: authHeader() });
  if (!dlRes.ok) return { ok: false, status: dlRes.status };
  return {
    ok: true,
    contentType: dlRes.headers.get('content-type') || 'application/pdf',
    filename: (meta.title || `dokument-${id}`) + '.pdf',
    body: dlRes.body,
  };
}

async function searchDocuments({ tag_ids, correspondent_id, document_type_id, created_after, created_before, query }) {
  const params = new URLSearchParams();
  params.set('page_size', '25');
  params.set('ordering', '-created');
  if (query) params.set('query', query);
  if (correspondent_id) params.set('correspondent__id', correspondent_id);
  if (document_type_id) params.set('document_type__id', document_type_id);
  if (created_after)    params.set('created__date__gte', created_after);
  if (created_before)   params.set('created__date__lte', created_before);
  if (Array.isArray(tag_ids) && tag_ids.length) {
    tag_ids.forEach(id => params.append('tags__id__all', id));
  }
  const plRes = await fetch(`${config.PAPERLESS_INTERNAL_URL}/api/documents/?${params}`, { headers: authHeader() });
  const plData = await plRes.json();
  const docs = (plData.results || []).map(d => ({
    id:            d.id,
    title:         d.title,
    created:       d.created_date || d.created || '',
    correspondent: d.correspondent_name || null,
    document_type: d.document_type_name || null,
    url:           `/api/paperless/download/${d.id}`,
  }));
  return { count: plData.count || docs.length, docs };
}

// Freitextsuche für den Paperless-Chat-Modus in /api/chat (isPaperless)
async function quickSearch(query, { limit = 10 } = {}) {
  const plUrl = `${config.PAPERLESS_INTERNAL_URL}/api/documents/?query=${encodeURIComponent(query)}&page_size=${limit}&ordering=-created`;
  const plRes = await fetch(plUrl, { headers: authHeader() });
  const plData = await plRes.json();
  return plData.results || [];
}

module.exports = { getMeta, getDocument, downloadDocument, searchDocuments, quickSearch };
