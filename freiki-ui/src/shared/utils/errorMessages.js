// Bessere Error-Messages für User – konkret statt generisch
function getDetailedErrorMessage(error) {
  const msg = (error.message || error.toString()).toLowerCase();

  // Datei-Fehler
  if (msg.includes('enoent') || msg.includes('file not found')) {
    return 'Datei nicht gefunden – bitte erneut hochladen';
  }
  if (msg.includes('limit') || msg.includes('too large') || msg.includes('exceeds')) {
    return 'Datei überschreitet Größenlimit – bitte kleinere Datei verwenden';
  }
  if (msg.includes('filetype') || msg.includes('mime') || msg.includes('invalid')) {
    return 'Ungültiger Dateityp – bitte PDF, Bild oder Textdatei verwenden';
  }

  // KI/LLM-Fehler
  if (msg.includes('vllm') || msg.includes('llm') || msg.includes('model')) {
    return 'KI-Modell ist überlastet – bitte in 1 Minute erneut versuchen';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Anfrage abgelaufen – die KI war zu langsam, bitte erneut versuchen';
  }
  if (msg.includes('connection') || msg.includes('econnrefused') || msg.includes('refused')) {
    return 'Verbindung zur KI fehlgeschlagen – Service möglicherweise offline, bitte erneut versuchen';
  }

  // Datenbank-Fehler
  if (msg.includes('postgres') || msg.includes('database') || msg.includes('pool')) {
    return 'Datenbankfehler – bitte in wenigen Sekunden erneut versuchen';
  }

  // Authentifizierung
  if (msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'Zugriff verweigert – möglicherweise fehlende Berechtigung';
  }

  // Fallback: wenn Error ein custom Message hat, nutze diese
  if (error.message && !msg.includes('internal') && error.message.length < 100) {
    return error.message;
  }

  return 'Fehler beim Verarbeiten deiner Anfrage – bitte erneut versuchen';
}

module.exports = { getDetailedErrorMessage };
