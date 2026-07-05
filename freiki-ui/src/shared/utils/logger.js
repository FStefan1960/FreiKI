// Bewusst minimal gehalten (kein Winston o.ä.) – nur Zeitstempel/Prefix-Konsistenz,
// damit Logs aus verschiedenen Modulen sich in `docker logs` zuordnen lassen.
function prefix(tag) {
  return `[${tag}]`;
}

function info(tag, ...args) {
  console.log(prefix(tag), ...args);
}

function warn(tag, ...args) {
  console.warn(prefix(tag), ...args);
}

function error(tag, ...args) {
  console.error(prefix(tag), ...args);
}

module.exports = { info, warn, error };
