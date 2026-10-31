// Réglages › Synchronisation (#/settings/sync) : choix du service (Google Drive, OneDrive), état, options.
import { useState } from 'preact/hooks';
import { Icon } from './components.jsx';
import { href, useApp } from './ctx.js';
import { errorText, locale, t } from './i18n.js';
import { PROVIDERS } from './use-sync.js';

/** « il y a 3 minutes » dans la langue de l'interface. */
export function ago(iso, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function syncStatusText(sync) {
  if (sync.status === 'syncing') return t('sync.status.syncing');
  if (sync.status === 'paused') return t('sync.status.paused');
  if (sync.status === 'error') return t('sync.status.error');
  if (!sync.provider) return t('sync.status.off');
  return sync.lastSync ? t('sync.status.done', { ago: ago(sync.lastSync) }) : t('sync.status.connected');
}

export function SyncPage() {
  const { sync } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const act = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e);
    }
    setBusy(false);
  };
  const error = err || sync.error;

  return (
    <div class="sync-page">
      <p class="crumbs">
        <a href={href('settings')}>{t('common.settings')}</a>
      </p>
      <h1>
        {t('sync.title')} <span class="badge dev">{t('common.inDevelopment')}</span>
      </h1>
      <p class="lead">{t('sync.intro')}</p>
      <p class="notice" role="note">
        {t('sync.devNotice')}
      </p>

      {sync.provider ? (
        <section class="panel sync-card">
          <div class="sync-head">
            <Icon name="cloud" size={22} />
            <strong>{sync.service}</strong>
            <span class={'sync-status ' + sync.status}>{syncStatusText(sync)}</span>
          </div>
          <p>{t(`sync.where.${sync.provider}`)}</p>
          <label class="check">
            <input type="checkbox" checked={sync.auto} onChange={(e) => sync.setAuto(e.currentTarget.checked)} />
            <span>{t('sync.auto')}</span>
          </label>
          <div class="actions">
            <button class="btn primary" disabled={busy || sync.status === 'syncing'} onClick={() => act(sync.syncNow)}>
              <Icon name="cloud" /> {sync.status === 'paused' ? t('sync.resume') : t('sync.now')}
            </button>
            <button class="btn" disabled={busy} onClick={() => act(async () => sync.disconnect())}>
              {t('sync.disconnect')}
            </button>
          </div>
          {error && sync.status !== 'paused' && (
            <p class="notice bad" role="alert">
              {errorText(error)}
            </p>
          )}
        </section>
      ) : (
        <>
          <p>{t('sync.choose')}</p>
          <div class="sync-choices">
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <section key={id} class="panel sync-card">
                <div class="sync-head">
                  <Icon name="cloud" size={22} />
                  <strong>{p.name}</strong>
                </div>
                <p>{t(`sync.desc.${id}`)}</p>
                {!p.available() && <p class="notice small">{t('sync.unavailable', { service: p.name })}</p>}
                <button
                  class="btn primary"
                  disabled={busy || !p.available()}
                  onClick={() => act(() => sync.connect(id))}
                >
                  {t('sync.connectTo', { service: p.name })}
                </button>
              </section>
            ))}
          </div>
          {error && (
            <p class="notice bad" role="alert">
              {errorText(error)}
            </p>
          )}
        </>
      )}

      <section class="panel">
        <h2>{t('sync.howTitle')}</h2>
        <ul class="sync-how">
          <li>{t('sync.how.devices')}</li>
          <li>{t('sync.how.merge')}</li>
          <li>{t('sync.how.privacy')}</li>
          <li>{t('sync.how.session')}</li>
          <li>{t('sync.how.folder')}</li>
        </ul>
      </section>
    </div>
  );
}
