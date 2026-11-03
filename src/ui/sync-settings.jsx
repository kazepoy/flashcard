// Réglages › Synchronisation (#/settings/sync) : connexion au service (Dropbox), état, options, fonctionnement.
import { useState } from 'preact/hooks';
import { Icon } from './components.jsx';
import { useApp } from './ctx.js';
import { ago, errorText, t } from './i18n.js';
import { PROVIDERS } from './use-sync.js';

export function syncStatusText(sync) {
  if (sync.status === 'syncing') return t('sync.status.syncing');
  if (sync.status === 'paused') return t('sync.status.paused');
  if (sync.status === 'error') return t('sync.status.error');
  if (!sync.provider) return t('sync.status.off');
  return sync.lastSync ? t('sync.status.done', { ago: ago(sync.lastSync) }) : t('sync.status.connected');
}

/** Contenu de la rubrique « Synchronisation » des réglages. */
export function SyncSettings() {
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
    <div class="sync-settings">
      <p>{t('sync.intro')}</p>
      <p class="notice" role="note">
        {t('sync.devNotice')}
      </p>

      {sync.provider ? (
        <div class="sync-card">
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
              <Icon name="cloud" />{' '}
              {sync.status === 'paused' ? t('sync.reconnect', { service: sync.service }) : t('sync.now')}
            </button>
            <button class="btn" disabled={busy} onClick={() => act(async () => sync.disconnect())}>
              {t('sync.disconnect')}
            </button>
          </div>
          {/* en pause, le motif est le statut lui-même ; un échec de la reconnexion est montré */}
          {error && (sync.status !== 'paused' || error.code !== 'syncAuth') && (
            <p class="notice bad" role="alert">
              {errorText(error)}
            </p>
          )}
        </div>
      ) : (
        <>
          <p>{t('sync.choose')}</p>
          <div class="sync-choices">
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <div key={id} class="sync-card">
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
              </div>
            ))}
          </div>
          {error && (
            <p class="notice bad" role="alert">
              {errorText(error)}
            </p>
          )}
        </>
      )}

      <h3>{t('sync.howTitle')}</h3>
      <ul class="sync-how">
        <li>{t('sync.how.devices')}</li>
        <li>{t('sync.how.merge')}</li>
        <li>{t('sync.how.settings')}</li>
        <li>{t('sync.how.privacy')}</li>
        <li>{t('sync.how.folder')}</li>
      </ul>
    </div>
  );
}
