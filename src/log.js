// log.js — ÉN log-kanal for hele appen. Område-tagget => søgbart i konsollen.
const t = () => new Date().toISOString().slice(11, 23);
function line(fn, color, area, args) { fn(`%c[${t()}] ${area}`, `color:${color};font-weight:bold`, ...args); }
export const log = {
  info: (area, ...a) => line(console.log, '#2b5797', area, a),
  ok:   (area, ...a) => line(console.log, '#2e7d32', area, a),
  warn: (area, ...a) => line(console.warn, '#a3360b', area, a),
  err:  (area, ...a) => line(console.error, '#c62828', area, a),
};
