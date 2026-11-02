// Réglages › Synchronisation : Dropbox (sync-settings.jsx) et, pour un dossier de l'ordinateur, copies en conflit.
import { useApp } from '../ctx.js';
import { t } from '../i18n.js';
import { SyncSettings } from '../sync-settings.jsx';
import { useRun } from './run.js';

export function SyncSection() {
  const { lib, kind, refresh } = useApp();
  const { busy, run } = useRun();
  return (
    <>
      <SyncSettings />
      {kind === 'fsa' && (
        <>
          <h3>{t('settings.conflictCopies')}</h3>
          <p class="muted small">{t('settings.conflictCopiesHint')}</p>
          <div class="actions">
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
          </div>
        </>
      )}
    </>
  );
}
