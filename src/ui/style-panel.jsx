// Panneau « Apparence » d'un jeu ou d'une carte.
import { CLOZE_COLORS, PAPER_COLORS, FONTS, SIZES, ALIGNS, PAPERS, isHex, sanitizeStyle } from '../core/style.js';
import { Icon } from './components.jsx';
import { t } from './i18n.js';
import { MediaField } from './media-field.jsx';

// ------------------------------------------------------------------ style

export function Swatches({ value, onChange, allowNone = true, label, colors = PAPER_COLORS }) {
  const custom = value && !colors.some((c) => c.hex === value);
  return (
    <div class="swatches" role="group" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          class={'swatch none' + (!value ? ' on' : '')}
          aria-pressed={!value}
          title={t('editor.default')}
          aria-label={t('editor.default')}
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
 * `inherit` (panneau d'une carte) : chaque liste propose « Comme le jeu » et enregistre
 * toute valeur choisie explicitement, pour pouvoir revenir au défaut de l'application
 * quand le jeu impose autre chose. Sans `inherit` (panneau du jeu), le défaut n'est pas stocké.
 */
export function StylePanel({ style, onChange, preview, inherit = false }) {
  const s = sanitizeStyle(style);
  const patch = (k, v) => {
    const next = { ...s };
    if (v === undefined || v === null || v === '') delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const choice = (key, values, def) => (
    <label class="field-inline">
      <span>{t(`style.${key}`)}</span>
      <select
        value={s[key] || (inherit ? '' : def)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          patch(key, !inherit && v === def ? undefined : v);
        }}
      >
        {inherit && <option value="">{t('editor.sameAsSet')}</option>}
        {values.map((f) => (
          <option key={f} value={f}>
            {t(`style.${key}.${f}`)}
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
          <Swatches value={s.bg} onChange={(v) => patch('bg', v)} label={t('editor.backgroundColor')} />
        </div>
        <div class="row">
          <span class="lbl">{t('editor.backBackground')}</span>
          <Swatches value={s.backBg} onChange={(v) => patch('backBg', v)} label={t('editor.backBackgroundColor')} />
        </div>
        <div class="row">
          <span class="lbl">{t('editor.text')}</span>
          <Swatches value={s.fg} onChange={(v) => patch('fg', v)} label={t('editor.textColor')} />
          <small class="muted">{t('editor.adjustedAutomaticallyHardRead')}</small>
        </div>
        <div class="row">
          <span class="lbl">{t('style.cloze')}</span>
          <Swatches
            value={s.cloze}
            onChange={(v) => patch('cloze', v)}
            label={t('style.cloze')}
            colors={CLOZE_COLORS}
          />
        </div>
        <div class="row grid-sel">
          {choice('font', FONTS, 'serif')}
          {choice('size', SIZES, 'md')}
          {choice('align', ALIGNS, 'left')}
          {choice('paper', PAPERS, 'ruled')}
        </div>
        <MediaField
          kind="image"
          label={t('editor.backgroundImage')}
          value={s.bgImage || null}
          onChange={(v) => patch('bgImage', v || undefined)}
        />
        <button type="button" class="btn small" onClick={() => onChange({})}>
          <Icon name="undo" /> {t('editor.resetStyle')}
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
