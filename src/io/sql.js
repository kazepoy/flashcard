// Chargement paresseux de sql.js (WASM), seulement pour lire ou écrire un paquet Anki : le module (~40 Ko)
// et son .wasm ne pèsent pas sur le démarrage. En navigateur, `setSqlWasmBase` indique où servir le .wasm.

let base = null;
let promise = null;

export function setSqlWasmBase(url) {
  base = url;
}

export function loadSql() {
  if (!promise) {
    promise = import('sql.js').then((m) => (m.default ?? m)(base ? { locateFile: (f) => base + f } : {}));
  }
  return promise;
}
