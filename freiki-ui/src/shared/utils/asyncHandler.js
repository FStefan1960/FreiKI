// Express 4 reicht rejected Promises aus async Route-Handlern NICHT automatisch an
// den errorHandler weiter (anders als Express 5) — ohne diesen Wrapper bleibt eine
// Anfrage bei einer unerwarteten Exception einfach ohne Antwort haengen, statt sauber
// mit 500 zu beantworten.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
