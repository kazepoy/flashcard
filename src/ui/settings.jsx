import { useState } from 'preact/hooks';
import { AI_PRESETS, aiConfigured, loadAiConfig, saveAiConfig } from '../ai/client.js';
import { chooseFolder, fsaSupported, reconnectFolder, openBrowserStorage } from './boot.js';
import { Dialog, Icon, downloadBlob, fileDate } from './components.jsx';
import { href, useApp } from './ctx.js';
import { errorText, t } from './i18n.js';
import { LANGS } from './languages.js';
import { syncStatusText } from './sync-page.jsx';
import { READING_FONTS, SYSTEM_FONT, THEMES } from './themes.js';

export function SettingsPage() {
  const app = useApp();
  const { lib, settings, saveSettings, kind, folderName, needsPermission, switchLibrary, toast, refresh } = app;
  const [ai, setAi] = useState(loadAiConfig());
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const set = (patch) => saveSettings({ ...settings, ...patch });
  const setAiCfg = (patch) => {
    const next = { ...ai, ...patch };
    setAi(next);
    saveAiConfig(next);
  };

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(errorText(e), 'bad');
    }
    setBusy(false);
  };

  const exportAll = () =>
    run(async () => {
      const { sets } = await lib.listSets();
      downloadBlob(
        `${fileDate()}-flashcard-bibliotheque.flashcard.zip`,
        await lib.exportBundleBytes(sets.map((s) => s.id)),
        'application/zip',
      );
    });
  const importBundle = (file) =>
    run(
      async () => {
        const ids = await lib.importBundleBytes(new Uint8Array(await file.arrayBuffer()));
        refresh();
        return ids.length;
      },
      (n) => t('settings.setsRestored', { n }),
    );

  return (
    <div class="settings">
      <h1>{t('common.settings')}</h1>

      <section class="panel">
        <h2>{t('settings.appearanceLanguage')}</h2>
        <div class="grid-2">
          <label class="field">
            <span>{t('settings.language')}</span>
            <select value={settings.lang} onChange={(e) => set({ lang: e.currentTarget.value })}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <span />
          <label class="field">
            <span>{t('settings.termLanguageNewSets')}</span>
            <select
              value={settings.language?.term || ''}
              onChange={(e) => set({ language: { ...settings.language, term: e.currentTarget.value || null } })}
            >
              {LANGS.map(([c, n]) => (
                <option key={c} value={c}>
                  {t(n)}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>{t('settings.definitionLanguageNewSets')}</span>
            <select
              value={settings.language?.definition || ''}
              onChange={(e) => set({ language: { ...settings.language, definition: e.currentTarget.value || null } })}
            >
              {LANGS.map(([c, n]) => (
                <option key={c} value={c}>
                  {t(n)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ThemePicker value={settings.theme} onChange={(theme) => set({ theme })} />
        <FontPicker value={settings.readingFont} onChange={(readingFont) => set({ readingFont })} />
      </section>

      <section class="panel">
        <h2>{t('settings.study')}</h2>
        <div class="grid-2">
          <label class="field">
            <span>{t('settings.newCardsPerDay', { n: settings.newPerDay })}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.newPerDay}
              onInput={(e) => set({ newPerDay: Number(e.currentTarget.value) })}
            />
          </label>
          <label class="field">
            <span>{t('settings.maximumReviewsPerDay', { n: settings.reviewsPerDay })}</span>
            <input
              type="range"
              min="20"
              max="500"
              step="10"
              value={settings.reviewsPerDay}
              onInput={(e) => set({ reviewsPerDay: Number(e.currentTarget.value) })}
            />
          </label>
          <label class="field">
            <span>{t('settings.targetRetention', { n: Math.round(settings.retention * 100) })}</span>
            <input
              type="range"
              min="0.7"
              max="0.97"
              step="0.01"
              value={settings.retention}
              onInput={(e) => set({ retention: Number(e.currentTarget.value) })}
            />
            <small class="muted">{t('settings.higherMoreFrequentReviews')}</small>
          </label>
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.typoTolerance}
            onChange={(e) => set({ typoTolerance: e.currentTarget.checked })}
          />
          <span>{t('settings.flagLikelyTyposInstead')}</span>
        </label>
        <label class="check">
          <input type="checkbox" checked={settings.tts} onChange={(e) => set({ tts: e.currentTarget.checked })} />
          <span>{t('settings.readAloudButtonsBrowser')}</span>
        </label>
      </section>

      <section class="panel">
        <h2>
          {t('sync.title')} <span class="badge dev">{t('common.inDevelopment')}</span>
        </h2>
        <p>{t('sync.settingsSummary')}</p>
        <div class="actions">
          <a class="btn primary" href={href('settings/sync')}>
            <Icon name="cloud" /> {app.sync.provider ? t('sync.manage') : t('sync.setup')}
          </a>
          <span class="muted small">{syncStatusText(app.sync)}</span>
        </div>
      </section>

      <section class="panel">
        <h2>{t('settings.storage')}</h2>
        {kind === 'fsa' ? (
          <p>{t('settings.dataFolderComputerOpen', { n: folderName })}</p>
        ) : (
          <p>{t('settings.dataBrowserStorageStays')}</p>
        )}
        {needsPermission && (
          <p class="notice">
            {t('settings.folderMustAllowedAgain', { n: folderName })}{' '}
            <button
              class="btn small"
              onClick={() => run(async () => switchLibrary(await reconnectFolder(needsPermission)))}
            >
              {t('common.allow')}
            </button>
          </p>
        )}
        <div class="actions">
          {fsaSupported() ? (
            <>
              <button
                class="btn"
                disabled={busy}
                onClick={() =>
                  run(
                    async () => switchLibrary(await chooseFolder({ migrateFrom: kind === 'idb' ? lib.store : null })),
                    t('settings.folderConnected'),
                  )
                }
              >
                <Icon name="folder" />{' '}
                {kind === 'fsa' ? t('settings.changeFolder') : t('settings.chooseFolderCopiesCurrent')}
              </button>
              {kind === 'fsa' && (
                <button
                  class="btn"
                  disabled={busy}
                  onClick={() =>
                    run(async () => switchLibrary(await openBrowserStorage()), t('settings.backBrowserStorage'))
                  }
                >
                  {t('settings.useBrowserStorage')}
                </button>
              )}
            </>
          ) : (
            <p class="muted">{t('settings.browserCannotOpenFolder')}</p>
          )}
        </div>
        <h3>{t('settings.backupMaintenance')}</h3>
        <div class="actions">
          <button class="btn" disabled={busy} onClick={exportAll}>
            <Icon name="download" /> {t('settings.exportWholeLibrary')}
          </button>
          <label class="btn">
            <Icon name="upload" /> {t('settings.restoreArchive')}
            <input
              type="file"
              hidden
              accept=".zip"
              onChange={(e) => (
                e.currentTarget.files[0] && importBundle(e.currentTarget.files[0]), (e.currentTarget.value = '')
              )}
            />
          </label>
          <button
            class="btn"
            disabled={busy}
            onClick={() =>
              run(
                async () => {
                  const n = await lib.resolveConflicts();
                  refresh();
                  return n;
                },
                (n) => (n ? t('settings.conflictingFilesMerged', { n }) : t('settings.noConflictsResolve')),
              )
            }
          >
            {t('settings.resolveSyncConflicts')}
          </button>
          <button
            class="btn"
            disabled={busy}
            onClick={() =>
              run(
                () => lib.gcMedia(),
                (n) => t('settings.unusedMediaFilesDeleted', { n }),
              )
            }
          >
            {t('settings.deleteUnusedMedia')}
          </button>
        </div>
      </section>

      <section class="panel">
        <h2>{t('settings.artificialIntelligence')}</h2>
        <p class="muted">{t('settings.usedGenerateCardsNotes')}</p>
        <div class="grid-2">
          <label class="field">
            <span>{t('settings.provider')}</span>
            <select
              value={Object.entries(AI_PRESETS).find(([, p]) => p.baseUrl === ai.baseUrl)?.[0] || 'custom'}
              onChange={(e) => AI_PRESETS[e.currentTarget.value] && setAiCfg({ ...AI_PRESETS[e.currentTarget.value] })}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
              <option value="custom">{t('settings.otherOpenaiCompatible')}</option>
            </select>
          </label>
          <label class="field">
            <span>{t('settings.model')}</span>
            <input value={ai.model} onInput={(e) => setAiCfg({ model: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span>{t('settings.apiAddress')}</span>
            <input
              value={ai.baseUrl}
              placeholder="https://…"
              onInput={(e) =>
                setAiCfg({
                  baseUrl: e.currentTarget.value,
                  provider: /anthropic/.test(e.currentTarget.value) ? 'anthropic' : 'openai',
                })
              }
            />
          </label>
          <label class="field">
            <span>{t('settings.apiKey')}</span>
            <input
              type="password"
              autocomplete="off"
              value={ai.apiKey}
              onInput={(e) => setAiCfg({ apiKey: e.currentTarget.value })}
            />
          </label>
        </div>
        <p class={'muted small'}>{aiConfigured(ai) ? t('settings.ready') : t('settings.enterKeyLocalAddress')}</p>
      </section>

      <section class="panel">
        <h2>{t('settings.shortcuts')}</h2>
        <dl class="kv small">
          <div>
            <dt>{t('settings.flashcardsReview')}</dt>
            <dd>
              <kbd>{t('common.space')}</kbd> {t('settings.kbdFlip')} · <kbd>←</kbd>
              <kbd>→</kbd> · <kbd>1</kbd>–<kbd>4</kbd> {t('settings.kbdRate')} · <kbd>S</kbd> {t('settings.kbdStar')}
            </dd>
          </div>
          <div>
            <dt>{t('mode.learn')}</dt>
            <dd>
              <kbd>1</kbd>–<kbd>4</kbd> {t('settings.kbdChoose')} · <kbd>↵</kbd> {t('settings.kbdContinue')}
            </dd>
          </div>
          <div>
            <dt>{t('settings.editor')}</dt>
            <dd>
              <kbd>Ctrl</kbd>+<kbd>↵</kbd> {t('settings.kbdNewCard')}
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel danger-zone">
        <h2>{t('settings.dangerZone')}</h2>
        <h3>{t('settings.deleteEverything')}</h3>
        <p>{t('settings.erasesAllSetsProgress')}</p>
        <button class="btn bad-outline" onClick={() => setWipeOpen(true)}>
          <Icon name="trash" /> {t('settings.deleteEverythingReset')}
        </button>
      </section>
      {wipeOpen && (
        <WipeDialog kind={kind} folderName={folderName} onExport={exportAll} onClose={() => setWipeOpen(false)} />
      )}
    </div>
  );
}

/** Confirmation de la remise à zéro, avec une dernière occasion d'exporter. */
function WipeDialog({ kind, folderName, onExport, onClose }) {
  const { lib } = useApp();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const wipe = async () => {
    setBusy(true);
    try {
      await lib.wipe();
      for (const k of Object.keys(localStorage)) if (k.startsWith('flashcard.')) localStorage.removeItem(k);
      location.hash = '';
      location.reload();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('settings.deleteEverythingConfirm')}
      onClose={onClose}
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn bad" disabled={!sure || busy} onClick={wipe}>
            {t('settings.deleteEverything')}
          </button>
        </>
      }
    >
      <p>
        {kind === 'fsa'
          ? t('settings.libraryFilesDeletedFolder', { n: folderName })
          : t('settings.flashcardsDataDeletedBrowser')}{' '}
        {t('settings.irreversible')}
      </p>
      <p>
        <button class="btn" onClick={onExport}>
          <Icon name="download" /> {t('settings.exportWholeLibraryFirst')}
        </button>
      </p>
      <label class="check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.currentTarget.checked)} />
        <span>{t('settings.iUnderstandEverythingPermanently')}</span>
      </label>
      {err && (
        <p class="notice bad" role="alert">
          {err}
        </p>
      )}
    </Dialog>
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
