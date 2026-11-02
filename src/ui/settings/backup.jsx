// Réglages › Sauvegarde et restauration : emplacement des données, export et restauration, jeux archivés,
// nettoyage, zone de danger (purge du stockage en ligne, remise à zéro).
import { useState } from 'preact/hooks';
import { chooseFolder, fsaSupported, reconnectFolder, openBrowserStorage } from '../boot.js';
import { Dialog, Icon, downloadBlob, fileDate } from '../components.jsx';
import { useApp, useAsync } from '../ctx.js';
import { errorText, t, tn } from '../i18n.js';
import { markBackup } from '../backup-notice.jsx';
import { useRun } from './run.js';

export function BackupSettings() {
  const app = useApp();
  const { lib, kind, folderName, needsPermission, switchLibrary, refresh } = app;
  const { busy, run } = useRun();
  const [wipeOpen, setWipeOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  /** Sauvegarde complète : tous les jeux, leur progression et les jeux archivés, dans une archive téléchargée. */
  const exportLibrary = async () => {
    const { sets } = await lib.listSets();
    downloadBlob(
      `${fileDate()}-flashcard-bibliotheque.flashcard.zip`,
      await lib.exportBundleBytes(
        sets.map((s) => s.id),
        { withArchives: true },
      ),
      'application/zip',
    );
    markBackup();
  };
  const exportAll = () => run(exportLibrary);
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
    <>
      <h3>{t('settings.dataLocation')}</h3>
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
      {fsaSupported() && (
        <div class="actions">
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
        </div>
      )}

      <h3>{t('settings.backup')}</h3>
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
              e.currentTarget.files[0] && importBundle(e.currentTarget.files[0]),
              (e.currentTarget.value = '')
            )}
          />
        </label>
      </div>

      <Archives />

      <h3>{t('settings.cleanup')}</h3>
      <div class="actions">
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
        {app.sync.provider && (
          <button
            class="btn"
            disabled={busy}
            onClick={() =>
              run(
                () => app.sync.clean(),
                (r) => t('settings.remoteCleaned', { service: app.sync.service, media: r.media, stray: r.stray }),
              )
            }
          >
            <Icon name="cloud" /> {t('settings.cleanRemote', { service: app.sync.service })}
          </button>
        )}
      </div>
      <p class="muted small">{app.sync.provider ? t('settings.cleanRemoteHint') : t('settings.remoteNeedsSync')}</p>

      <div class="danger-zone">
        <h3>{t('settings.dangerZone')}</h3>
        {app.sync.provider && (
          <>
            <h4>{t('settings.purgeRemote', { service: app.sync.service })}</h4>
            <p>{t('settings.purgeRemoteHint', { service: app.sync.service })}</p>
            <button class="btn bad-outline" disabled={busy} onClick={() => setPurgeOpen(true)}>
              <Icon name="cloud" /> {t('settings.purgeRemoteAction')}
            </button>
          </>
        )}
        <h4>{t('settings.deleteEverything')}</h4>
        <p>{t('settings.erasesAllSetsProgress')}</p>
        <button class="btn bad-outline" onClick={() => setWipeOpen(true)}>
          <Icon name="trash" /> {t('settings.deleteEverythingReset')}
        </button>
      </div>
      {wipeOpen && (
        <WipeDialog kind={kind} folderName={folderName} onExport={exportAll} onClose={() => setWipeOpen(false)} />
      )}
      {purgeOpen && <PurgeDialog onExport={exportLibrary} onClose={() => setPurgeOpen(false)} />}
    </>
  );
}

/** Jeux archivés : restauration dans la bibliothèque, ou suppression définitive (confirmée d'un second clic). */
function Archives() {
  const { lib, version, refresh, toast } = useApp();
  const { data, reload } = useAsync(() => lib.listArchives(), [lib, version]);
  const [confirm, setConfirm] = useState(null);
  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
    } catch (e) {
      toast(errorText(e), 'bad');
    }
    setConfirm(null);
    reload();
    refresh();
  };
  return (
    <>
      <h3>{t('settings.archivedSets')}</h3>
      {!data?.length ? (
        <p class="muted small">{t('settings.noArchivedSets')}</p>
      ) : (
        <ul class="archive-list">
          {data.map((a) => (
            <li key={a.id}>
              <span class="archive-title">
                <strong>{a.title || '—'}</strong> <span class="muted small">{tn('common.nCards', a.count)}</span>
              </span>
              <button
                class="btn small"
                onClick={() => act(() => lib.restoreArchive(a.id), t('settings.archiveRestored', { title: a.title }))}
              >
                <Icon name="undo" /> {t('settings.restore')}
              </button>
              <button
                class={'btn small ' + (confirm === a.id ? 'bad' : 'bad-outline')}
                onClick={() =>
                  confirm === a.id
                    ? act(() => lib.deleteArchive(a.id), t('settings.archiveDeleted', { title: a.title }))
                    : setConfirm(a.id)
                }
              >
                <Icon name="trash" /> {confirm === a.id ? t('settings.confirmDelete') : t('settings.deleteArchive')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p class="muted small">{t('settings.archivedSetsHint')}</p>
    </>
  );
}

/** Confirmation de la purge du stockage en ligne (la bibliothèque de cet appareil n'est pas touchée). */
function PurgeDialog({ onExport, onClose }) {
  const { sync, toast } = useApp();
  const [exported, setExported] = useState(false); // export de précaution fait dans cette fenêtre
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** Synchronise d'abord (l'export reflète alors aussi ce qui est en ligne), puis exporte toute la bibliothèque. */
  const backup = async () => {
    setBusy(true);
    setErr('');
    try {
      await sync.syncNow();
      await onExport();
      setExported(true);
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  const purge = async () => {
    setBusy(true);
    try {
      const n = await sync.purge();
      toast(t('settings.remotePurged', { n, service: sync.service }));
      onClose();
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('settings.purgeRemoteConfirm', { service: sync.service })}
      onClose={onClose}
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn bad" disabled={!exported || !sure || busy} onClick={purge}>
            {t('settings.purgeRemoteAction')}
          </button>
        </>
      }
    >
      <p>{t('settings.purgeRemoteHint', { service: sync.service })}</p>
      <p class="notice small">{t('settings.purgeNeedsBackup')}</p>
      <p>
        <button class={'btn' + (exported ? '' : ' primary')} disabled={busy} onClick={backup}>
          <Icon name={exported ? 'check' : 'download'} />{' '}
          {exported ? t('settings.purgeBackupDone') : t('settings.purgeBackupFirst')}
        </button>
      </p>
      <label class="check">
        <input type="checkbox" checked={sure} disabled={!exported} onChange={(e) => setSure(e.currentTarget.checked)} />
        <span>{t('settings.purgeRemoteSure', { service: sync.service })}</span>
      </label>
      {err && (
        <p class="notice bad" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}

/** Confirmation de la remise à zéro, avec une dernière occasion d'exporter. */
function WipeDialog({ kind, folderName, onExport, onClose }) {
  const { lib, sync } = useApp();
  const service = sync.provider ? sync.service : null; // lu avant l'arrêt, qui déconnecte
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const wipe = async () => {
    setBusy(true);
    try {
      await sync.halt(); // sinon une synchronisation propagerait l'effacement en ligne
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
      {service && <p class="notice small">{t('settings.wipeKeepsRemote', { service })}</p>}
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
