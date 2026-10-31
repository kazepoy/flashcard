// Conversion HTML (champs Anki) ↔ Markdown léger.

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENT[m] ?? m);
}

/**
 * HTML d'un champ Anki → markdown. Renvoie aussi les médias référencés.
 * @returns {{text:string, images:string[], sounds:string[]}}
 */
export function htmlToMd(html = '') {
  const images = [];
  const sounds = [];
  let s = String(html);
  s = s.replace(/\[sound:([^\]]+)\]/g, (_, f) => {
    sounds.push(f);
    return '';
  });
  s = s.replace(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_, a, b, c) => {
    const f = decodeEntities(a ?? b ?? c ?? '');
    images.push(f);
    return `![](${f})`;
  });
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a\b[^>]*?\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: s, images, sounds };
}
