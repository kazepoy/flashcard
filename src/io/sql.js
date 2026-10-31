// Chargement paresseux de sql.js (WASM). En navigateur, `setSqlWasmBase` indique où servir le .wasm.
import initSqlJs from 'sql.js';

let base = null;
let promise = null;

export function setSqlWasmBase(url) {
  base = url;
}

export function loadSql() {
  if (!promise) {
    promise = initSqlJs(base ? { locateFile: (f) => base + f } : {});
  }
  return promise;
}
