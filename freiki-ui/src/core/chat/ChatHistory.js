function parseHistory(history) {
  if (!history) return [];
  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = { parseHistory };
