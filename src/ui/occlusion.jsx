// Image masquée : affichage (étude) et éditeur de masques (rectangles, ellipses).
import { useEffect, useRef, useState } from 'preact/hooks';
import { compactGroups, groupsOf, maskState, normalizeMasks } from '../core/occlusion.js';
import { Icon, useMediaMap } from './components.jsx';
import { t, tn } from './i18n.js';

function useImage(path) {
  const map = useMediaMap([path || '']);
  const url = path?.startsWith('media/') ? map[path] : path;
  const [size, setSize] = useState(null);
  const onLoad = (e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  return { url, size, onLoad };
}

/** Une forme dans le repère en pixels de l'image (W × H). */
function Shape({ m, W, H, ...rest }) {
  if (m.shape === 'polygon')
    return <polygon points={m.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')} {...rest} />;
  const [x, y, w, h] = [m.x * W, m.y * H, m.w * W, m.h * H];
  const tr = m.angle ? `rotate(${m.angle} ${x} ${y})` : undefined;
  if (m.shape === 'ellipse')
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} transform={tr} {...rest} />;
  return <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.04} transform={tr} {...rest} />;
}

/**
 * Image et masques pour l'étude.
 * `occ` = {image, masks, n, mode} ; side = 'prompt' | 'answer'.
 */
export function OcclusionView({ occ, side }) {
  const { url, size, onLoad } = useImage(occ.image);
  const [W, H] = size ? [size.w, size.h] : [1, 1];
  const active = occ.masks.filter((m) => m.n === occ.n);
  const label =
    side === 'prompt' ? tn('occlusion.imageMaskedAreasGuess', active.length) : t('occlusion.imageAreaRevealed');
  return (
    <div class="occ-view" role="img" aria-label={label}>
      {url && <img src={url} alt="" onLoad={onLoad} draggable={false} />}
      {size && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {occ.masks.map((m, i) => {
            const st = maskState(m, occ.n, occ.mode, side);
            if (st === 'none') return null;
            return <Shape key={i} m={m} W={W} H={H} class={'occ-mask ' + st} vector-effect="non-scaling-stroke" />;
          })}
          {side === 'prompt' &&
            active.map((m, i) => (
              <text
                key={'q' + i}
                class="occ-q"
                x={(m.x + m.w / 2) * W}
                y={(m.y + m.h / 2) * H}
                font-size={Math.max(12, Math.min(m.w * W, m.h * H) * 0.5)}
                text-anchor="middle"
                dominant-baseline="central"
              >
                ?
              </text>
            ))}
        </svg>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ éditeur

const MIN = 0.01;

/**
 * Dessin des masques : glisser sur l'image crée une forme ; cliquer en sélectionne une,
 * qu'on déplace par glisser ou redimensionne par sa poignée. Suppr efface, flèches déplacent.
 */
export function OcclusionEditor({ image, masks, mode, onChange, onMode }) {
  const { url, size, onLoad } = useImage(image);
  const svg = useRef();
  const [tool, setTool] = useState('rect');
  const [sel, setSel] = useState(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState(null);
  const [W, H] = size ? [size.w, size.h] : [1, 1];
  const groups = groupsOf(masks);
  const nextGroup = (groups.length ? Math.max(...groups) : 0) + 1;

  useEffect(() => {
    if (sel != null && sel >= masks.length) setSel(null);
  }, [sel, masks.length]);

  const pt = (e) => {
    const r = svg.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const commit = (list) => onChange(normalizeMasks(list));
  const setMask = (i, patch) => commit(masks.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const removeMask = (i) => {
    commit(compactGroups(masks.filter((_, j) => j !== i)));
    setSel(null);
  };

  const down = (e) => {
    if (e.button > 0) return;
    const p = pt(e);
    const target = e.target.closest('[data-i]');
    const handle = e.target.closest('[data-handle]');
    svg.current.setPointerCapture(e.pointerId);
    if (handle && sel != null) {
      drag.current = { kind: 'resize', i: sel, start: p, orig: masks[sel] };
    } else if (target) {
      const i = Number(target.dataset.i);
      setSel(i);
      drag.current = { kind: 'move', i, start: p, orig: masks[i] };
    } else {
      setSel(null);
      drag.current = { kind: 'draw', start: p };
      setDraft({ shape: tool, x: p.x, y: p.y, w: 0, h: 0 });
    }
    e.preventDefault();
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = pt(e);
    if (d.kind === 'draw') {
      setDraft({
        shape: tool,
        x: Math.min(p.x, d.start.x),
        y: Math.min(p.y, d.start.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      });
    } else if (d.kind === 'move' && d.orig.shape !== 'polygon') {
      const x = Math.min(1 - d.orig.w, Math.max(0, d.orig.x + p.x - d.start.x));
      const y = Math.min(1 - d.orig.h, Math.max(0, d.orig.y + p.y - d.start.y));
      d.moved = true;
      onChange(masks.map((m, j) => (j === d.i ? { ...m, x, y } : m)));
    } else if (d.kind === 'resize') {
      onChange(
        masks.map((m, j) =>
          j === d.i
            ? { ...m, w: Math.max(MIN, Math.min(1 - m.x, p.x - m.x)), h: Math.max(MIN, Math.min(1 - m.y, p.y - m.y)) }
            : m,
        ),
      );
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'draw') {
      setDraft(null);
      if (draft && draft.w > MIN && draft.h > MIN) {
        commit([...masks, { ...draft, n: nextGroup }]);
        setSel(masks.length);
      }
    } else if (d) commit(masks);
  };
  const key = (e) => {
    if (sel == null) return;
    const m = masks[sel];
    const step = e.shiftKey ? 0.05 : 0.01;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeMask(sel);
    } else if (e.key === 'Escape') setSel(null);
    else if (mv && m.shape !== 'polygon') {
      e.preventDefault();
      setMask(sel, { x: Math.min(1 - m.w, Math.max(0, m.x + mv[0])), y: Math.min(1 - m.h, Math.max(0, m.y + mv[1])) });
    }
  };

  if (!image) return <p class="muted">{t('occlusion.addImageFirst')}</p>;
  const s = sel != null ? masks[sel] : null;

  return (
    <div class="occ-editor">
      <div class="occ-toolbar">
        <div class="seg" role="group" aria-label={t('occlusion.shape')}>
          <button
            type="button"
            class={'seg-opt' + (tool === 'rect' ? ' on' : '')}
            aria-pressed={tool === 'rect'}
            onClick={() => setTool('rect')}
          >
            {t('occlusion.rectangle')}
          </button>
          <button
            type="button"
            class={'seg-opt' + (tool === 'ellipse' ? ' on' : '')}
            aria-pressed={tool === 'ellipse'}
            onClick={() => setTool('ellipse')}
          >
            {t('occlusion.ellipse')}
          </button>
        </div>
        <label class="field-inline">
          <span>{t('occlusion.whenStudying')}</span>
          <select value={mode} onChange={(e) => onMode(e.currentTarget.value)}>
            <option value="all">{t('occlusion.hideAllGuessOne')}</option>
            <option value="one">{t('occlusion.hideOneGuessOne')}</option>
          </select>
        </label>
        <span class="muted small">
          {groups.length ? tn('occlusion.groupsStudyCards', groups.length) : t('occlusion.dragImageMaskArea')}
        </span>
      </div>
      <div class="occ-stage" tabIndex={0} onKeyDown={key} aria-label={t('occlusion.maskDrawingArea')}>
        {url && <img src={url} alt="" onLoad={onLoad} draggable={false} />}
        {size && (
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {masks.map((m, i) => (
              <g key={i} data-i={i} class={'occ-edit' + (i === sel ? ' sel' : '')}>
                <Shape m={m} W={W} H={H} class="occ-mask edit" vector-effect="non-scaling-stroke" />
                <text
                  class="occ-num"
                  x={(m.x + m.w / 2) * W}
                  y={(m.y + m.h / 2) * H}
                  font-size={Math.max(12, Math.min(m.w * W, m.h * H) * 0.4)}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {m.n}
                </text>
              </g>
            ))}
            {s && s.shape !== 'polygon' && (
              <rect
                data-handle
                class="occ-handle"
                x={(s.x + s.w) * W - 8 * (W / 600)}
                y={(s.y + s.h) * H - 8 * (W / 600)}
                width={16 * (W / 600)}
                height={16 * (W / 600)}
              />
            )}
            {draft && <Shape m={draft} W={W} H={H} class="occ-mask draft" vector-effect="non-scaling-stroke" />}
          </svg>
        )}
      </div>
      {s && (
        <div class="occ-props">
          <label class="field-inline">
            <span>{t('occlusion.group')}</span>
            <select value={s.n} onChange={(e) => setMask(sel, { n: Number(e.currentTarget.value) })}>
              {[...groups, nextGroup].map((n) => (
                <option key={n} value={n}>
                  {n === nextGroup ? t('occlusion.newGroup', { n }) : n}
                </option>
              ))}
            </select>
          </label>
          <label class="field-inline grow">
            <span>{t('occlusion.answerOptional')}</span>
            <input
              value={s.label || ''}
              placeholder={t('occlusion.labelPlaceholder')}
              onInput={(e) => setMask(sel, { label: e.currentTarget.value })}
            />
          </label>
          <button type="button" class="btn small bad-outline" onClick={() => removeMask(sel)}>
            <Icon name="trash" /> {t('occlusion.deleteMask')}
          </button>
        </div>
      )}
      <p class="muted small">{t('occlusion.masksSameGroupRevealed')}</p>
    </div>
  );
}
