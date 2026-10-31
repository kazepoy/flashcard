import { sha256Hex } from '../core/ids.js';
import { extOf, MIME } from '../storage/library.js';

const MAX_SIDE = 1600;
const MAX_BYTES = 300 * 1024;
const RASTER = ['png', 'jpg', 'jpeg', 'webp'];

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function find(bytes, sig, limit = bytes.length) {
  const end = Math.min(limit, bytes.length) - sig.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < sig.length; j++) if (bytes[i + j] !== sig[j]) continue outer;
    return i;
  }
  return -1;
}

/** PNG animé (chunk acTL avant IDAT) ou WebP animé (drapeau du chunk VP8X) : le canevas n'en garderait qu'une image. */
function isAnimated(bytes, ext) {
  if (ext === 'png') {
    const idat = find(bytes, ascii('IDAT'), 1 << 16);
    return find(bytes, ascii('acTL'), idat < 0 ? 1 << 16 : idat) >= 0;
  }
  if (ext === 'webp') return find(bytes, ascii('VP8X'), 16) === 12 && (bytes[20] & 0x02) !== 0;
  return false;
}

const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

function hasAlpha(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

/**
 * Allège une image raster trop grande (plus de MAX_SIDE px) ou trop lourde (plus de MAX_BYTES) :
 * réduite puis réencodée en WebP, ou en JPEG / PNG (transparence) si le navigateur n'encode pas le WebP.
 * Gardée telle quelle si elle est déjà légère, animée, d'un autre format, ou si le résultat n'est pas plus petit.
 */
export async function shrinkImage(bytes, ext, { maxSide = MAX_SIDE, maxBytes = MAX_BYTES } = {}) {
  const same = { bytes, ext };
  if (
    !RASTER.includes(ext) ||
    isAnimated(bytes, ext) ||
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  )
    return same;
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: MIME[ext] }));
    const side = Math.max(bmp.width, bmp.height);
    if (side <= maxSide && bytes.length <= maxBytes) {
      bmp.close?.();
      return same;
    }
    const k = Math.min(1, maxSide / side);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    let blob = await toBlob(c, 'image/webp', 0.85);
    let outExt = 'webp';
    if (blob?.type !== 'image/webp') {
      const alpha = ext !== 'jpg' && ext !== 'jpeg' && hasAlpha(ctx, c.width, c.height);
      blob = await toBlob(c, alpha ? 'image/png' : 'image/jpeg', 0.85);
      outExt = alpha ? 'png' : 'jpg';
    }
    if (!blob || blob.size >= bytes.length) return same;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: outExt };
  } catch {
    return same;
  }
}

/** Enregistre un fichier image/audio dans la bibliothèque et renvoie son chemin media/…. */
export async function fileToMedia(lib, file, kind = 'image') {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === 'image') {
    const r = await shrinkImage(bytes, extOf(file.name));
    return lib.putMedia(r.bytes, r.ext);
  }
  return lib.putMedia(bytes, extOf(file.name));
}

/** Allège les images d'un import et renomme leurs chemins (media/<sha256>.<ext>) partout dans les jeux. */
export async function shrinkImportedMedia(sets, media) {
  const out = new Map();
  const renamed = new Map();
  for (const [path, bytes] of media) {
    const r = await shrinkImage(bytes, extOf(path));
    if (r.bytes === bytes) {
      out.set(path, bytes);
      continue;
    }
    const p = `media/${await sha256Hex(r.bytes)}.${r.ext}`;
    out.set(p, r.bytes);
    renamed.set(path, p);
  }
  if (!renamed.size) return { sets, media };
  let json = JSON.stringify(sets);
  for (const [a, b] of renamed) json = json.replaceAll(a, b);
  return { sets: JSON.parse(json), media: out };
}
