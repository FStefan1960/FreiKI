// Zentrale Fehlerbehandlung: liefert immer JSON statt HTML-Fehlerseiten.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error('Request-Fehler:', err.message);
  res.status(err.status || 400).json({ error: err.message || 'Interner Fehler' });
}

module.exports = { errorHandler };
