// Archive d'échange .flashcard.zip (voir docs/SPEC.md).
import JSZip from 'jszip';
import { collectMedia, newManifest, normalizeProgress, normalizeSet } from '../core/format.js';
import { AppError } from '../core/errors.js';

const SAFE =
  /^(flashcard\.json|settings\.json|sets\/[0-9A-Za-z_-]+\.json|progress\/[0-9A-Za-z_-]+\.json|logs\/[0-9A-Za-z_-]+\.jsonl|media\/[0-9a-f]{64}\.[0-9a-z]{1,6})$/;

/**
 * @param {{sets:Array, progress?:Record<string,object>, logs?:Record<string,string>, getMedia:(p:string)=>Promise<Uint8Array|null>}} o
 */
export async function exportBundle({ sets, progress = {}, logs = {}, getMedia = async () => null }) {
  const zip = new JSZip();
  zip.file('flashcard.json', JSON.stringify(newManifest(), null, 2));
  const media = new Set();
  for (const s of sets) {
    zip.file(`sets/${s.id}.json`, JSON.stringify(s, null, 2));
    if (progress[s.id]) zip.file(`progress/${s.id}.json`, JSON.stringify(progress[s.id], null, 2));
    if (logs[s.id]) zip.file(`logs/${s.id}.jsonl`, logs[s.id]);
    for (const p of collectMedia(s)) media.add(p);
  }
  for (const p of media) {
    if (!SAFE.test(p)) continue;
    const b = await getMedia(p);
    if (b) zip.file(p, b);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * @returns {Promise<{sets:Array, progress:Record<string,object>, logs:Record<string,string>, media:Map<string,Uint8Array>}>}
 */
export async function importBundle(data) {
  const zip = await JSZip.loadAsync(data);
  const manifest = zip.file('flashcard.json');
  if (!manifest) throw new AppError('bundleNoManifest', 'Archive invalide : flashcard.json absent');
  const m = JSON.parse(await manifest.async('string'));
  if (m.format !== 'flashcard' || m.version > 1)
    throw new AppError('bundleVersion', 'Archive Flashcard de version non prise en charge');
  const sets = [];
  const progress = {};
  const logs = {};
  const media = new Map();
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    if (!SAFE.test(name)) continue; // ignore tout fichier hors du format (zip-slip, etc.)
    if (name.startsWith('sets/')) sets.push(normalizeSet(JSON.parse(await zip.file(name).async('string'))));
    else if (name.startsWith('media/')) media.set(name, await zip.file(name).async('uint8array'));
  }
  for (const s of sets) {
    const p = zip.file(`progress/${s.id}.json`);
    if (p) progress[s.id] = normalizeProgress(JSON.parse(await p.async('string')), s.id);
    const l = zip.file(`logs/${s.id}.jsonl`);
    if (l) logs[s.id] = await l.async('string');
  }
  return { sets, progress, logs, media };
}
