// Racine de l'application : bibliothèque, contexte global, barre de navigation, bandeaux, page courante.
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { setSqlWasmBase } from '../io/sql.js';
import { reconnectFolder } from './boot.js';
import { Icon, Toasts, useToasts } from './components.jsx';
import { AppCtx, href, routeOf, useRoute } from './ctx.js';
import { errorText, getLang, onLang, t } from './i18n.js';
import { Routes } from './routes.jsx';
import { StorageNotice } from './storage-notice.jsx';
import { applyReadingFont, applyTheme } from './themes.js';
import { useLibrary } from './use-library.js';
import { useSync } from './use-sync.js';

function TopBar({ route }) {
  const current = (page) =>
    route.page === page || (page === 'settings' && route.page === 'sync') ? 'page' : undefined;
  return (
    <header class={'topbar' + (route.page === 'browse' ? ' wide' : '')}>
      <a class="brand" href={href('')} aria-label="Flashcard">
        <span class="brand-card" aria-hidden="true" />
        <span class="brand-name">Flashcard</span>
      </a>
      <nav aria-label={t('app.navigation')}>
        {[
          ['', 'library', 'books', 'common.library'],
          ['browse', 'browse', 'list', 'common.cards'],
          ['stats', 'stats', 'chart', 'common.statistics'],
        ].map(([path, page, icon, label]) => (
          <a key={page} href={href(path)} aria-current={current(page)}>
            {/* sur un petit écran, l'icône remplace le texte (gardé pour les lecteurs d'écran) */}
            <span class="nav-icon">
              <Icon name={icon} />
            </span>
            <span class="nav-text">{t(label)}</span>
          </a>
        ))}
        <a href={href('settings')} aria-current={current('settings')}>
          <Icon name="gear" /> <span class="nav-label">{t('common.settings')}</span>
        </a>
        <a href={href('help')} aria-current={current('help')} aria-label={t('help.title')} title={t('help.title')}>
          <Icon name="help" />
        </a>
      </nav>
    </header>
  );
}

function Root() {
  const library = useLibrary();
  const { lib, meta, settings, version, fatal, refresh, open, saveSettings } = library;
  const { items: toasts, toast, dismiss } = useToasts();
  const sync = useSync(lib, refresh);
  const [lang, setLangState] = useState(getLang());
  const route = routeOf(useRoute());
  const studying = route.page === 'study';

  useEffect(() => onLang(setLangState), []);
  // nouvelle version prête (voir main.jsx) : la page ouverte tourne encore sur l'ancienne
  useEffect(() => {
    const ready = () => toast(t('app.updateReady'), '', { label: t('app.reload'), run: () => location.reload() });
    addEventListener('flashcard-update', ready);
    return () => removeEventListener('flashcard-update', ready);
  }, [toast]);
  useEffect(() => applyTheme(settings?.theme || 'auto'), [settings?.theme]);
  useEffect(() => applyReadingFont(settings?.readingFont || 'default'), [settings?.readingFont]);

  const ctx = useMemo(
    () => ({ lib, settings, saveSettings, toast, lang, version, ...meta, refresh, switchLibrary: open, sync }),
    [lib, settings, saveSettings, toast, lang, version, meta, refresh, open, sync],
  );

  if (fatal) {
    return (
      <main class="boot-error">
        <h1>{t('app.unableOpenLibrary')}</h1>
        <p>{errorText(fatal)}</p>
      </main>
    );
  }
  if (!lib || !settings) return <p class="boot">{t('common.loading')}</p>;

  return (
    <AppCtx.Provider value={ctx}>
      {!studying && <TopBar route={route} />}
      {meta.needsPermission && !studying && (
        <div class="notice banner" role="status">
          {t('app.folderNotAllowedYet', { n: meta.folderName })}
          <button class="btn small" onClick={async () => open(await reconnectFolder(meta.needsPermission))}>
            {t('common.allow')}
          </button>
        </div>
      )}
      {sync.status === 'paused' && !studying && (
        <div class="notice banner" role="status">
          {t('sync.pausedBanner', { service: sync.service })}
          <button class="btn small" onClick={() => sync.syncNow()}>
            {t('sync.resume')}
          </button>
        </div>
      )}
      {meta.kind === 'idb' && !meta.needsPermission && !sync.provider && !studying && <StorageNotice />}
      <div class={'page' + (studying ? ' studying' : '') + (route.page === 'browse' ? ' wide' : '')}>
        <Routes route={route} />
      </div>
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppCtx.Provider>
  );
}

export function start(el = document.getElementById('app')) {
  setSqlWasmBase('./');
  render(<Root />, el);
}
