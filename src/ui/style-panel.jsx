// Apparence des cartes, à trois niveaux présentés de la même façon : réglages, jeu, carte.
import {
  autoFg,
  CLOZE_COLORS,
  TEXT_COLORS,
  PAPER_COLORS,
  FONTS,
  SIZES,
  ALIGNS,
  VALIGNS,
  PAPERS,
  isHex,
  mergeStyle,
  sanitizeStyle,
} from '../core/style.js';
import { renderCloze } from '../core/text.js';
import { Fold, Icon, IndexCard, Md } from './components.jsx';
import { useApp } from './ctx.js';
import { t } from './i18n.js';
import { MediaField } from './media-field.jsx';
import { defaultCardFont } from './themes.js';

// ------------------------------------------------------------------ style

export function Swatches({ value, onChange, allowNone = true, label, colors = PAPER_COLORS, noneLabel }) {
  const custom = value && !colors.some((c) => c.hex === value);
  return (
    <div class="swatches" role="group" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          class={'swatch none' + (!value ? ' on' : '')}
          aria-pressed={!value}
          title={noneLabel || t('editor.default')}
          aria-label={noneLabel || t('editor.default')}
          onClick={() => onChange(undefined)}
        >
          <Icon name="x" size={14} />
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c.id}
          type="button"
          class={'swatch' + (value === c.hex ? ' on' : '')}
          style={{ background: c.hex }}
          aria-pressed={value === c.hex}
          aria-label={c.hex}
          title={c.hex}
          onClick={() => onChange(c.hex)}
        />
      ))}
      <label
        class={'swatch custom' + (custom ? ' on' : '')}
        style={custom ? { background: value } : undefined}
        title={t('editor.customColor')}
      >
        <input
          type="color"
          value={isHex(value) ? value : '#ffffff'}
          aria-label={t('editor.customColor')}
          onInput={(e) => onChange(e.currentTarget.value.toUpperCase())}
        />
        {!custom && <Icon name="plus" size={14} />}
      </label>
    </div>
  );
}

// libellés : clés `style.<propriété>.<valeur>` des dictionnaires

/**
 * `inherit` (jeu, carte) : libellé du choix « hériter du niveau au-dessus » (« Comme les réglages »,
 * « Comme le jeu ») ; toute valeur choisie explicitement est enregistrée, pour pouvoir revenir au défaut
 * de l'application quand le niveau au-dessus impose autre chose. Sans `inherit` (réglages), le défaut
 * n'est pas stocké. `image` : propose une image de fond.
 */
function StylePanel({ style, onChange, preview, inherit = null, image = true, resetLabel, base = {} }) {
  const { settings } = useApp();
  const s = sanitizeStyle(style);
  // couleur de texte remplacée sur un fond où elle serait illisible : on le dit (recto, verso)
  const eff = mergeStyle(base, s);
  const unreadable = eff.fg
    ? [
        [eff.bg, 'appearance.side.front'],
        [eff.backBg || eff.bg, 'appearance.side.back'],
      ].filter(([bg]) => bg && autoFg(bg, eff.fg) !== eff.fg)
    : [];
  // « Par défaut » annonce la police qu'auront les cartes : celle des réglages, sinon manuscrite
  const label = (key, v) =>
    key === 'font' && v === 'default'
      ? t('style.font.default', { font: t(`style.font.${defaultCardFont(settings)}`) })
      : t(`style.${key}.${v}`);
  const patch = (k, v) => {
    const next = { ...s };
    if (v === undefined || v === null || v === '') delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const choice = (key, values, def) => (
    <label class="field">
      <span>{t(`style.${key}`)}</span>
      <select
        value={s[key] || (inherit ? '' : def)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          patch(key, !inherit && v === def ? undefined : v);
        }}
      >
        {inherit && <option value="">{inherit}</option>}
        {values.map((f) => (
          <option key={f} value={f}>
            {label(key, f)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div class="style-panel">
      <div class="style-controls">
        <div class="row">
          <span class="lbl">{t('editor.background')}</span>
          <Swatches
            value={s.bg}
            onChange={(v) => patch('bg', v)}
            label={t('editor.backgroundColor')}
            noneLabel={inherit}
          />
        </div>
        <div class="row">
          <span class="lbl">{t('editor.backBackground')}</span>
          <Swatches
            value={s.backBg}
            onChange={(v) => patch('backBg', v)}
            label={t('editor.backBackgroundColor')}
            noneLabel={inherit}
          />
        </div>
        <div class="row">
          <span class="lbl">{t('editor.text')}</span>
          <Swatches
            value={s.fg}
            onChange={(v) => patch('fg', v)}
            label={t('editor.textColor')}
            noneLabel={inherit}
            colors={TEXT_COLORS}
          />
          {unreadable.length > 0 ? (
            <small class="notice small" role="status">
              {t('appearance.fgUnreadable', { sides: unreadable.map(([, k]) => t(k)).join(', ') })}
            </small>
          ) : (
            <small class="muted">{t('editor.adjustedAutomaticallyHardRead')}</small>
          )}
        </div>
        <div class="row">
          <span class="lbl">{t('style.cloze')}</span>
          <Swatches
            value={s.cloze}
            onChange={(v) => patch('cloze', v)}
            label={t('style.cloze')}
            colors={CLOZE_COLORS}
            noneLabel={inherit}
          />
        </div>
        <div class="row grid-sel">
          {choice('font', FONTS, 'default')}
          {choice('size', SIZES, 'md')}
          {choice('align', ALIGNS, 'center')}
          {choice('valign', VALIGNS, 'middle')}
          {choice('paper', PAPERS, 'ruled')}
        </div>
        {image && (
          <MediaField
            kind="image"
            label={t('editor.backgroundImage')}
            value={s.bgImage || null}
            onChange={(v) => patch('bgImage', v || undefined)}
          />
        )}
        <button type="button" class="btn small" disabled={!Object.keys(s).length} onClick={() => onChange({})}>
          <Icon name="undo" /> {resetLabel}
        </button>
      </div>
      {preview && (
        <div class="style-preview" aria-hidden="true">
          {preview(s)}
        </div>
      )}
    </div>
  );
}

// `reset` : vider le style d'un niveau rend celui du niveau au-dessus (défaut de l'application, réglages, jeu)
const LEVELS = {
  global: {
    title: 'appearance.globalTitle',
    hint: 'appearance.globalHint',
    inherit: null,
    reset: 'appearance.resetGlobal',
  },
  set: {
    title: 'appearance.setTitle',
    hint: 'appearance.setHint',
    inherit: 'appearance.sameAsSettings',
    reset: 'appearance.resetSet',
  },
  card: {
    title: 'appearance.cardTitle',
    hint: 'appearance.cardHint',
    inherit: 'editor.sameAsSet',
    reset: 'appearance.resetCard',
  },
};

/**
 * Bloc « Apparence des cartes », identique aux trois niveaux : toujours ouvert dans les réglages, repliable
 * pour un jeu ou une carte. `base` : style effectif du niveau au-dessus (réglages, ou réglages + jeu) ;
 * `sample` : textes de l'aperçu (ceux de la carte, sinon génériques). Un point signale une apparence
 * modifiée à ce niveau.
 */
export function AppearanceSection({ level, style, onChange, base = {}, sample = null, children }) {
  const L = LEVELS[level];
  const custom = Object.keys(sanitizeStyle(style)).length > 0;
  // aperçu générique : le verso montre aussi un mot révélé, pour voir la couleur des mots révélés
  const face = (side, text) => (
    <div class="face-content">
      {sample ? (
        sample[side]
      ) : (
        <>
          <p>{text}</p>
          {side === 'answer' && <Md text={renderCloze(`{{c1::${t('appearance.revealedWord')}}}`, 1, 'reveal')} />}
        </>
      )}
    </div>
  );
  const panel = (
    <>
      <StylePanel
        style={style}
        onChange={onChange}
        inherit={L.inherit && t(L.inherit)}
        image={level !== 'global'}
        resetLabel={t(L.reset)}
        base={base}
        preview={(s) => {
          const eff = mergeStyle(base, s);
          return (
            <div class="mini-pair">
              <IndexCard class="mini" style={eff} side="prompt">
                {face('prompt', t('browse.sort.term'))}
              </IndexCard>
              <IndexCard class="mini" style={eff} side="answer">
                {face('answer', t('browse.sort.def'))}
              </IndexCard>
            </div>
          );
        }}
      />
      <p class="muted small">{t(L.hint)}</p>
      {children}
    </>
  );
  if (level === 'global') return <div class="appearance">{panel}</div>;
  return (
    <Fold
      class="appearance"
      summary={
        <>
          {t(L.title)}
          {custom && <span class="appearance-dot" title={t('appearance.customized')} />}
        </>
      }
    >
      {panel}
    </Fold>
  );
}
