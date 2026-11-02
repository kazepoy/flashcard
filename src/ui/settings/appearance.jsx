// Réglages › Apparence (langue, thème, police) et Apparence par défaut des cartes.
import { useApp, useAsync } from '../ctx.js';
import { errorText, t, tn } from '../i18n.js';
import { Icon } from '../components.jsx';
import { LANGS } from '../languages.js';
import { AppearanceSection } from '../style-panel.jsx';
import { READING_FONTS, SYSTEM_FONT, THEMES } from '../themes.js';

/** Langue de l'interface, thème, police de lecture. */
export function AppearanceSettings() {
  const { settings, saveSettings } = useApp();
  const set = (patch) => saveSettings({ ...settings, ...patch });
  return (
    <>
      <div class="grid-2">
        <label class="field">
          <span>{t('settings.language')}</span>
          <select value={settings.lang} onChange={(e) => set({ lang: e.currentTarget.value })}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <ThemePicker value={settings.theme} onChange={(theme) => set({ theme })} />
      <FontPicker value={settings.readingFont} onChange={(readingFont) => set({ readingFont })} />
    </>
  );
}

/** Langues des nouveaux jeux et apparence par défaut de toutes les cartes. */
export function CardDefaults() {
  const { settings, saveSettings } = useApp();
  const set = (patch) => saveSettings({ ...settings, ...patch });
  const langSelect = (label, key) => (
    <label class="field">
      <span>{label}</span>
      <select
        value={settings.language?.[key] || ''}
        onChange={(e) => set({ language: { ...settings.language, [key]: e.currentTarget.value || null } })}
      >
        {LANGS.map(([c, n]) => (
          <option key={c} value={c}>
            {t(n)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div class="grid-2">
        {langSelect(t('settings.termLanguageNewSets'), 'term')}
        {langSelect(t('settings.definitionLanguageNewSets'), 'definition')}
      </div>
      <AppearanceSection level="global" style={settings.cardStyle} onChange={(cardStyle) => set({ cardStyle })}>
        <OwnStyleSets />
      </AppearanceSection>
    </>
  );
}

/** Jeux qui ont leur propre apparence (ils ne suivent pas celle des réglages), avec de quoi l'effacer. */
function OwnStyleSets() {
  const { lib, version, refresh, toast } = useApp();
  const { data } = useAsync(() => lib.listSets(), [lib, version]);
  const styled = (data?.sets || []).filter((s) => s.styled);
  if (!styled.length) return null;
  const reset = async () => {
    try {
      for (const { id } of styled) {
        const s = await lib.loadSet(id);
        if (s) await lib.saveSet({ ...s, style: {} });
      }
    } catch (e) {
      toast(errorText(e), 'bad');
    }
    refresh();
  };
  return (
    <p class="notice small own-style">
      {tn('appearance.setsOwnStyle', styled.length)} <span class="muted">{styled.map((s) => s.title).join(', ')}</span>{' '}
      <button type="button" class="btn small" onClick={reset}>
        <Icon name="undo" /> {t('appearance.resetSetsToSettings')}
      </button>
    </p>
  );
}

// ------------------------------------------------------------------ thème

const colorsOf = (id) => THEMES.find((x) => x.id === id).colors;

/** Miniature d'un thème : bureau, panneau, bouton principal et fiche. */
function ThemePreview({ colors: c }) {
  return (
    <span class="tp" style={{ background: c.desk }} aria-hidden="true">
      <span class="tp-panel" style={{ background: c.surface, borderColor: c.line }}>
        <span class="tp-line" style={{ background: c.ink }} />
        <span class="tp-line short" style={{ background: c.muted }} />
        <span class="tp-btn" style={{ background: c.hi }} />
        <span class="tp-dot" style={{ background: c.accent }} />
      </span>
      <span
        class="tp-card"
        style={{
          background: c.paper,
          borderTopColor: c.margin,
          backgroundImage: `linear-gradient(${c.rule} 1px, transparent 1px)`,
        }}
      />
    </span>
  );
}

function ThemePicker({ value, onChange }) {
  const current = THEMES.some((x) => x.id === value) ? value : 'auto';
  const opt = (id, name, preview) => (
    <label class={'theme-opt' + (current === id ? ' on' : '')} key={id}>
      <input type="radio" name="theme" value={id} checked={current === id} onChange={() => onChange(id)} />
      {preview}
      <span>{name}</span>
    </label>
  );
  const group = (base, title) => (
    <>
      <h3 class="theme-group">{title}</h3>
      <div class="theme-grid">
        {THEMES.filter((x) => x.base === base).map((x) => opt(x.id, t(x.name), <ThemePreview colors={x.colors} />))}
      </div>
    </>
  );
  return (
    <fieldset class="theme-picker">
      <legend>{t('settings.theme')}</legend>
      <div class="theme-grid">
        {opt(
          'auto',
          t('settings.automatic'),
          <span class="tp-split">
            <ThemePreview colors={colorsOf('light')} />
            <ThemePreview colors={colorsOf('dark')} />
          </span>,
        )}
      </div>
      {group('light', t('settings.lightThemes'))}
      {group('dark', t('settings.darkThemes'))}
    </fieldset>
  );
}

// ------------------------------------------------------------------ police de lecture

/** Chaque option affiche son nom dans sa propre police. */
function FontPicker({ value, onChange }) {
  const current = READING_FONTS.some((x) => x.id === value) ? value : 'default';
  const opt = (id, name, stack, desc) => (
    <label class={'theme-opt font-opt' + (current === id ? ' on' : '')} key={id}>
      <input type="radio" name="reading-font" value={id} checked={current === id} onChange={() => onChange(id)} />
      <span class="font-name" style={{ fontFamily: stack }}>
        {name}
      </span>
      <small class="muted">{desc}</small>
    </label>
  );
  return (
    <fieldset class="theme-picker">
      <legend>{t('settings.readingFont')}</legend>
      <div class="font-grid">
        {opt('default', t('font.default'), SYSTEM_FONT, t('font.defaultDesc'))}
        {READING_FONTS.map((f) => opt(f.id, f.name, f.stack, t(f.desc)))}
      </div>
      <p class="muted small">{t('settings.readingFontHint')}</p>
    </fieldset>
  );
}
