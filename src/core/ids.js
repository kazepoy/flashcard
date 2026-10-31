const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Identifiant ULID : 10 caractères d'horodatage + 16 aléatoires (Crockford base32). */
export function ulid(now = Date.now(), cryptoImpl = globalThis.crypto) {
  let t = Math.floor(now);
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ENC[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const b = new Uint8Array(16);
  cryptoImpl.getRandomValues(b);
  let rnd = '';
  for (let i = 0; i < 16; i++) rnd += ENC[b[i] % 32];
  return time + rnd;
}

/** Horodatage (ms) d'un ULID, ou null si ce n'en est pas un. */
export function ulidTime(id) {
  if (typeof id !== 'string' || id.length < 10) return null;
  let t = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) {
    const v = ENC.indexOf(ch);
    if (v < 0) return null;
    t = t * 32 + v;
  }
  return t;
}

export const isId = (s) => typeof s === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s);

/** SHA-256 hexadécimal d'un ArrayBuffer / Uint8Array. */
export async function sha256Hex(data) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Mélange Fisher-Yates (RNG injectable pour les tests). */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** RNG déterministe (mulberry32) pour les tests. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
