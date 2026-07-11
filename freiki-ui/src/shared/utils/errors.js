// Zentrale Fehlerbehandlung: liefert immer JSON statt HTML-Fehlerseiten.
// Default 500 (nicht 400): ein Fehler ohne explizit gesetzten .status ist ein
// unerwarteter Server-Fehler, kein Client-Fehler.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error('Request-Fehler:', err);
  const status = err.status || 500;
  // Bei explizit gesetztem Status (bewusster Client-Fehler, z.B. 400) ist die
  // Meldung zur Anzeige gedacht. Bei einem unerwarteten 500 keine internen
  // Details (Stacktraces, DB-/Modul-Fehlermeldungen) an den Client leaken.
  const message = err.status ? err.message : 'Interner Fehler';
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
