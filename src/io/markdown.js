// Import / export Markdown (format décrit dans docs/SPEC.md).
import { newCard, newSet } from '../core/format.js';
import { hasCloze } from '../core/text.js';

const SEP = /^\s*---\s*$/;
const FIELD_RE = /^(hint|indice|example|exemple|extra|image|audio|tags?)\s*:\s*(.*)$/i;

function splitFrontMatter(lines) {
  if (!SEP.test(lines[0] ?? '')) return { meta: {}, rest: lines };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (SEP.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end < 0) return { meta: {}, rest: lines };
  const fm = lines.slice(1, end);
  if (!fm.every((l) => !l.trim() || /^[A-Za-z_][\w-]*\s*:/.test(l))) return { meta: {}, rest: lines };
  const meta = {};
  for (const l of fm) {
    const m = l.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^\[.*\]$/.test(v))
      v = v
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    else v = v.replace(/^["']|["']$/g, '');
    meta[m[1].toLowerCase()] = v;
  }
  return { meta, rest: lines.slice(end + 1) };
}

/** @returns {{meta:Object, cards:Array}} */
export function parseMarkdown(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  const { meta, rest } = splitFrontMatter(lines);
  const blocks = [];
  let cur = [];
  for (const l of rest) {
    if (SEP.test(l)) {
      blocks.push(cur);
      cur = [];
    } else cur.push(l);
  }
  blocks.push(cur);

  const cards = [];
  for (const b of blocks) {
    const nonEmpty = b.filter((l) => l.trim());
    if (!nonEmpty.length) continue;
    const extras = {};
    const body = [];
    for (const l of b) {
      const m = l.match(FIELD_RE);
      if (m && !/^\s{2,}/.test(l))
        extras[
          m[1]
            .toLowerCase()
            .replace(/^indice$/, 'hint')
            .replace(/^exemple$/, 'example')
            .replace(/^tag$/, 'tags')
        ] = m[2].trim();
      else body.push(l);
    }
    const first = body.findIndex((l) => l.trim());
    if (first < 0) continue;
    const head = body[first].match(/^#{1,6}\s+(.*)$/);
    const mk = (p) => {
      const card = newCard({ hint: extras.hint || '', example: extras.example || '', ...p });
      if (extras.tags) card.tags = extras.tags.split(/[\s,]+/).filter(Boolean);
      if (extras.image && extras.image.startsWith('media/')) card.image = extras.image;
      if (extras.audio && extras.audio.startsWith('media/')) card.audio = extras.audio;
      return card;
    };
    if (head) {
      const def = body
        .slice(first + 1)
        .join('\n')
        .trim();
      cards.push(mk({ term: head[1].trim(), definition: def }));
    } else {
      const content = body.join('\n').trim();
      if (hasCloze(content)) {
        cards.push(mk({ type: 'cloze', term: content, definition: extras.extra || '' }));
      } else {
        // une ou plusieurs lignes « terme :: définition »
        for (const l of nonEmpty) {
          const m = l.match(/^(.*?)\s+(?:::|=>)\s+(.*)$/);
          if (m) cards.push(mk({ term: m[1].trim(), definition: m[2].trim() }));
        }
      }
    }
  }
  return { meta, cards };
}

/** Construit un jeu complet à partir d'un fichier Markdown. */
export function markdownToSet(text, fallbackTitle = 'Import Markdown') {
  const { meta, cards } = parseMarkdown(text);
  return newSet({
    title: meta.title || fallbackTitle,
    description: meta.description || '',
    folder: meta.folder || '',
    language: { term: meta.language_term || meta.language || null, definition: meta.language_definition || null },
    tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
    cards,
  });
}

export function exportMarkdown(set) {
  const out = [];
  const fm = ['---', `title: ${set.title}`];
  if (set.description) fm.push(`description: ${set.description.replace(/\n/g, ' ')}`);
  if (set.folder) fm.push(`folder: ${set.folder}`);
  if (set.language?.term) fm.push(`language: ${set.language.term}`);
  if (set.tags?.length) fm.push(`tags: [${set.tags.join(', ')}]`);
  fm.push('---', '');
  out.push(fm.join('\n'));
  const blocks = set.cards.map((c) => {
    const l = [];
    if (c.type === 'cloze') {
      l.push(c.term);
      if (c.definition) l.push('', 'Extra: ' + c.definition.replace(/\n/g, ' '));
    } else {
      l.push('# ' + c.term.replace(/\s*\n\s*/g, ' '));
      if (c.definition) l.push('', c.definition);
    }
    const extra = [];
    if (c.hint) extra.push('Hint: ' + c.hint.replace(/\n/g, ' '));
    if (c.example) extra.push('Example: ' + c.example.replace(/\n/g, ' '));
    if (c.tags?.length) extra.push('Tags: ' + c.tags.join(' '));
    if (c.image) extra.push('Image: ' + c.image);
    if (c.audio) extra.push('Audio: ' + c.audio);
    if (extra.length) l.push('', ...extra);
    return l.join('\n');
  });
  out.push(blocks.join('\n\n---\n\n'));
  return out.join('\n') + '\n';
}
