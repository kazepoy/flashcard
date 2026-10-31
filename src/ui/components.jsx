import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { mdToHtml, stripMarkdown } from '../core/text.js';
import { t } from './i18n.js';
import { useApp } from './ctx.js';
import { cardAppearance } from '../core/style.js';

// ------------------------------------------------------------------ icônes
const P = {
  star: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z',
  speaker: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5.5M13.5 11v5.5',
  edit: 'M4 20l1-4.5L16.5 4a1.8 1.8 0 012.5 0l1 1a1.8 1.8 0 010 2.5L8.5 19zM14.5 6l3.5 3.5',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  spark:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  back: 'M15 5l-7 7 7 7',
  books: 'M5 4h4v16H5zM10 4h4v16h-4zM15.4 5.2l3.9-1 3.3 15.5-3.9 1z',
  list: 'M4 6h16M4 12h16M4 18h10',
  chart: 'M5 20v-8M12 20V5M19 20v-12M3 20h18',
  pause: 'M9 6v12M15 6v12',
  cloud: 'M7 18h10.5a3.5 3.5 0 00.4-7A5.5 5.5 0 007.3 9.4 4.3 4.3 0 007 18z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  eyeOff:
    'M3 3l18 18M10.6 6.2A9.6 9.6 0 0112 6c5 0 8.5 4.5 9 6-.3.8-1.2 2.3-2.7 3.6M6.4 7.6C4.6 8.9 3.4 10.7 3 12c.5 1.5 4 6 9 6 1.4 0 2.7-.3 3.8-.9M9.9 9.9a3 3 0 004.2 4.2',
  offline: 'M3 3l18 18M8.5 18H17a3.5 3.5 0 001.6-6.6M15.2 7.2A5 5 0 007.3 9.4 4.3 4.3 0 007 18',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 13h5M9.5 16.5h5',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.8v.4',
  gear: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  shuffle:
    'M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.5 0 2.5-1.5 3.3-3M20 7h-3.5c-1.4 0-2.4 1-3.1 2.5M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  folder:
    'M3.5 7.5v10a1.5 1.5 0 001.5 1.5h14a1.5 1.5 0 001.5-1.5V9a1.5 1.5 0 00-1.5-1.5h-7l-2-2.5H5A1.5 1.5 0 003.5 6.5z',
  image:
    'M4 6.5A1.5 1.5 0 015.5 5h13A1.5 1.5 0 0120 6.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5zM8.5 10a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6zM4.5 16.5L9 12l4 4 2.5-2.5 4 4',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  print: 'M7 9V4h10v5M7 17H4.5v-6.5h15V17H17M7 14h10v6H7z',
  share: 'M12 4v11M8 8l4-4 4 4M6 11H5v9h14v-9h-1',
};

export function Icon({ name, size = 18, fill = false, label }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <path d={P[name]} />
    </svg>
  );
}

// ------------------------------------------------------------------ médias & markdown

/** Résout les chemins media/… d'un texte en URL blob. */
export function useMediaMap(texts) {
  const { lib } = useApp();
  const [map, setMap] = useState({});
  const key = texts.join('\u0000');
  useEffect(() => {
    let live = true;
    const paths = new Set();
    for (const s of key.split('\u0000'))
      for (const m of String(s || '').matchAll(/media\/[0-9a-f]{64}\.[0-9a-z]{1,6}/g)) paths.add(m[0]);
    if (!paths.size) {
      setMap({});
      return;
    }
    (async () => {
      const out = {};
      for (const p of paths) out[p] = await lib.mediaUrl(p);
      if (live) setMap(out);
    })();
    return () => {
      live = false;
    };
  }, [key, lib]);
  return map;
}

export function Md({ text, class: cls = '', extraMedia = [] }) {
  const map = useMediaMap([text, ...extraMedia]);
  const html = mdToHtml(text || '', (p) => (p.startsWith('media/') ? map[p] || '' : p));
  return <div class={'md ' + cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MediaImage({ path, alt = '' }) {
  const map = useMediaMap([path || '']);
  if (!path) return null;
  const url = path.startsWith('media/') ? map[path] : path;
  return url ? <img class="card-img" src={url} alt={alt} /> : null;
}

let currentAudio = null;
export function AudioButton({ path, text, lang, label }) {
  const { lib, settings } = useApp();
  const play = async (e) => {
    e?.stopPropagation?.();
    if (path) {
      const url = await lib.mediaUrl(path);
      currentAudio?.pause();
      currentAudio = new Audio(url);
      currentAudio.play().catch(() => {});
    } else if (text) speak(text, lang);
  };
  if (!path && !(text && settings.tts && 'speechSynthesis' in window)) return null;
  return (
    <button
      type="button"
      class="icon-btn"
      onClick={play}
      aria-label={label || t('common.listen')}
      title={label || t('common.listen')}
    >
      <Icon name="speaker" />
    </button>
  );
}

export function speak(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(stripMarkdown(text));
  if (lang) u.lang = lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ------------------------------------------------------------------ fiche (index card)

/**
 * Fiche bristol : lignes bleues, marge rouge — ou l'apparence choisie par l'utilisateur
 * (`style` : couleurs, police, papier, image de fond ; voir core/style.js).
 */
export function IndexCard({ children, class: cls = '', style, side = 'prompt', ...rest }) {
  const ap = cardAppearance(style || {}, side);
  const map = useMediaMap([ap.bgImage || '']);
  const css = { ...ap.vars };
  if (ap.bgImage && map[ap.bgImage]) css['--card-image'] = `url("${map[ap.bgImage]}")`;
  return (
    <div class={['index-card', ap.className, cls].join(' ')} style={css} {...rest}>
      {children}
    </div>
  );
}

export function FlipCard({ front, back, frontStyle, backStyle, flipped, onFlip, label }) {
  return (
    <div
      class={'flip' + (flipped ? ' is-flipped' : '')}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={label || t('common.flipCard')}
      onClick={onFlip}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFlip())}
    >
      <div class="flip-inner">
        <IndexCard class="face face-front" style={frontStyle} side="prompt" aria-hidden={flipped}>
          {/* en-tête de la fiche : de quelle face s'agit-il */}
          <span class="face-label">{t('study.faceQuestion')}</span>
          {front}
        </IndexCard>
        <IndexCard class="face face-back" style={backStyle} side="answer" aria-hidden={!flipped}>
          <span class="face-label answer">
            <Icon name="check" size={14} /> {t('study.faceAnswer')}
          </span>
          {back}
        </IndexCard>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ divers

export function Dialog({ title, onClose, children, wide = false, footer }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el?.showModal?.();
    const prev = document.activeElement;
    return () => prev?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      class={'dialog' + (wide ? ' wide' : '')}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <form method="dialog" class="dialog-head">
        <h2>{title}</h2>
        <button class="icon-btn" aria-label={t('common.close')} onClick={(e) => (e.preventDefault(), onClose())}>
          <Icon name="x" />
        </button>
      </form>
      <div class="dialog-body">{children}</div>
      {footer && <div class="dialog-foot">{footer}</div>}
    </dialog>
  );
}

/** Barre de progression ; `secondary` (≥ value) : deuxième ton, plus clair (ex. cartes vues mais pas terminées). */
export function ProgressBar({ value, max = 1, label, secondary = null }) {
  const pct = (v) => (max ? Math.round((v / max) * 100) : 0);
  return (
    <div
      class="bar"
      role="progressbar"
      aria-valuenow={pct(value)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={label}
    >
      {secondary != null && <div class="bar-fill secondary" style={{ width: pct(secondary) + '%' }} />}
      <div class="bar-fill" style={{ width: pct(value) + '%' }} />
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div class="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Notifications : `toast(texte, 'bad' | '', action)` ; disparaissent seules (plus tard si une action est proposée). */
export function useToasts() {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const dismiss = useCallback((id) => setItems((x) => x.filter((y) => y.id !== id)), []);
  const toast = useCallback(
    (text, kind = '', action = null) => {
      const id = ++seq.current;
      setItems((x) => [...x, { id, text, kind, action }]);
      setTimeout(() => dismiss(id), action ? 7000 : 3500);
    },
    [dismiss],
  );
  return { items, toast, dismiss };
}

export function Toasts({ items, onDismiss }) {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} class={'toast ' + (x.kind || '')}>
          <span>{x.text}</span>
          {x.action && (
            <button type="button" class="link-btn" onClick={() => (x.action.run(), onDismiss?.(x.id))}>
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function downloadBlob(name, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Partage un fichier par le menu natif (AirDrop, messagerie, mail…) si le navigateur sait
 * partager des fichiers ; sinon le télécharge. Renvoie 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareFile(name, data, type, { title = '', text = '' } = {}) {
  const file = typeof File === 'function' ? new File([data], name, { type }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (geste utilisateur expiré), etc. : on retombe sur le téléchargement.
    }
  }
  downloadBlob(name, data, type);
  return 'downloaded';
}

/** Date locale AAAA-MM-JJ, en tête des noms de fichiers exportés (tri chronologique dans un dossier). */
export const fileDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fileSlug = (s) =>
  (s || 'jeu')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'jeu';

export function useKeys(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers; // toujours les gestionnaires du dernier rendu
  useEffect(() => {
    const f = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') && !ref.current.__always) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const h = ref.current[e.key];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);
}
