const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { quickSearch } = require('../integrations/PaperlessService');

async function handlePaperlessMode(res, message) {
  const query = (message || '').trim();
  if (!query) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '🔍 Bitte einen Suchbegriff eingeben.' } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  try {
    const docs = await quickSearch(query, { limit: 10 });
    const brand = getBrandConfig();
    const publicUrl = brand.paperlessUrl || '';

    let md = '';
    if (!docs.length) {
      md = `Keine Dokumente gefunden für **„${query}"**.`;
    } else {
      md = `**${docs.length} Treffer** für „${query}":\n\n`;
      for (const doc of docs) {
        const date = doc.created_date || doc.created || '';
        const type = doc.document_type ? `· ${doc.document_type}` : '';
        const link = `[${doc.title}](/api/paperless/download/${doc.id})`;
        const viewLink = publicUrl ? ` · [🔗 Im Archiv öffnen](${publicUrl}/documents/${doc.id}/detail)` : '';
        md += `- ${link}${viewLink}  \n  📅 ${date}${type}\n`;
      }
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: md } }] })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '⚠️ Paperless nicht erreichbar.' } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = { handlePaperlessMode };
