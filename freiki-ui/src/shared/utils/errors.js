// Zentrale Fehlerbehandlung: liefert immer JSON statt HTML-Fehlerseiten.
// Default 500 (nicht 400): ein Fehler ohne explizit gesetzten .status ist ein
// unerwarteter Server-Fehler, kein Client-Fehler.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error('Request-Fehler:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Interner Fehler' });
}

module.exports = { errorHandler };
