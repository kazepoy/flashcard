// Synchronisation d'une bibliothèque avec un dossier distant (Google Drive…), fichier par fichier.
// Pour chaque fichier, on compare l'état local et l'état distant à ceux de la dernière synchronisation :
// un seul côté a changé → on le recopie ; les deux → on fusionne (règles de core/merge.js, comme pour
// les copies en conflit) ; un côté a disparu sans que l'autre change → la suppression est propagée.
// Les réglages (settings.json) restent propres à chaque appareil.
import { sha256Hex } from '../core/ids.js';
import { mergeLogs, mergeProgress, mergeSets } from '../core/merge.js';

const DIRS = ['sets', 'progress', 'logs', 'media'];
export const SYNCED =
  /^(sets\/[0-9A-Z]{26}\.json|progress\/[0-9A-Z]{26}\.json|logs\/[0-9A-Z]{26}\.jsonl|media\/[0-9a-f]{64}\.[0-9a-z]{1,6})$/;

const text = (b) => new TextDecoder().decode(b);
const bytes = (s) => new TextEncoder().encode(s);
const json = (o) => bytes(JSON.stringify(o, null, 2) + '\n');

/** Fusion de deux versions d'un même fichier. Un média est nommé par son contenu : identique des deux côtés. */
export function mergeFile(path, a, b) {
  if (path.startsWith('sets/')) return json(mergeSets(JSON.parse(text(a)), JSON.parse(text(b))));
  if (path.startsWith('progress/')) return json(mergeProgress(JSON.parse(text(a)), JSON.parse(text(b))));
  if (path.startsWith('logs/')) return bytes(mergeLogs(text(a), text(b)));
  return a;
}

/** Empreinte locale : SHA-256 du contenu ; un média, nommé par son SHA-256, n'est pas relu. */
const hashOf = async (lib, path) => (path.startsWith('media/') ? path : sha256Hex(await lib.readFile(path)));

/**
 * @param {import('./library.js').Library} lib
 * @param {{list:()=>Promise<{path:string, rev:string}[]>, read:(p:string)=>Promise<Uint8Array>,
 *          write:(p:string, b:Uint8Array)=>Promise<string>, remove:(p:string)=>Promise<void>}} remote
 *        `rev` change à chaque modification distante (empreinte du contenu, numéro de version…)
 * @param {{files?: Record<string, {hash:string, rev:string}>}} state état de la dernière synchronisation
 * @returns {Promise<{state, pulled:number, pushed:number, merged:number, removed:number}>}
 */
export async function syncLibrary(lib, remote, state = {}) {
  const before = state.files || {};
  const files = {};
  const stats = { pulled: 0, pushed: 0, merged: 0, removed: 0 };

  const local = new Map();
  for (const dir of DIRS)
    for (const f of await lib.listFiles(dir)) if (SYNCED.test(`${dir}/${f}`)) local.set(`${dir}/${f}`, true);
  const distant = new Map((await remote.list()).filter((f) => SYNCED.test(f.path)).map((f) => [f.path, f.rev]));

  const pull = async (path, rev) => {
    const b = await remote.read(path);
    await lib.writeFile(path, b);
    files[path] = { hash: path.startsWith('media/') ? path : await sha256Hex(b), rev };
    stats.pulled++;
  };
  const push = async (path, hash) => {
    files[path] = { hash, rev: await remote.write(path, await lib.readFile(path)) };
    stats.pushed++;
  };

  for (const path of new Set([...local.keys(), ...distant.keys(), ...Object.keys(before)])) {
    const last = before[path];
    const rev = distant.get(path) ?? null;
    const hash = local.has(path) ? await hashOf(lib, path) : null;
    const localChanged = hash !== (last?.hash ?? null);
    const remoteChanged = rev !== (last?.rev ?? null);

    if (!hash && !rev) continue; // disparu des deux côtés
    if (hash && rev && !localChanged && !remoteChanged) files[path] = last;
    else if (hash && !rev) {
      if (last && !localChanged) {
        await lib.removeFile(path); // supprimé à distance, inchangé ici
        stats.removed++;
      } else await push(path, hash);
    } else if (!hash && rev) {
      if (last && !remoteChanged) {
        await remote.remove(path); // supprimé ici, inchangé à distance
        stats.removed++;
      } else await pull(path, rev);
    } else if (!remoteChanged) await push(path, hash);
    else if (!localChanged || path.startsWith('media/')) await pull(path, rev);
    else {
      // modifié des deux côtés : fusion, écrite ici et à distance
      const merged = mergeFile(path, await lib.readFile(path), await remote.read(path));
      await lib.writeFile(path, merged);
      files[path] = { hash: await sha256Hex(merged), rev: await remote.write(path, merged) };
      stats.merged++;
    }
  }
  return { state: { ...state, files }, ...stats };
}
