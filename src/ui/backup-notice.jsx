// Bandeau de la bibliothèque : invite à configurer la synchronisation, ou rappelle qu'aucune synchronisation
// ni sauvegarde complète n'a eu lieu récemment.
import { Icon } from './components.jsx';
import { href } from './ctx.js';
import { ago, t } from './i18n.js';
import { readLocal, recentLocal, writeLocal } from './local.js';

const BACKUP_KEY = 'flashcard.lastBackup';
const SNOOZE_KEY = 'flashcard.backupNoticeSnooze';
const DAY = 86400000;
/** Au-delà, une synchronisation ou une sauvegarde n'est plus « récente ». */
export const RECENT_DAYS = 7;

/** Note une sauvegarde complète de la bibliothèque (export de tous les jeux). */
export const markBackup = () => writeLocal(BACKUP_KEY, new Date().toISOString());

const recent = (iso, now) => !!iso && now - Date.parse(iso) < RECENT_DAYS * DAY;

/**
 * Message à afficher (clé et variables), ou null si une synchronisation ou une sauvegarde complète est récente.
 * @param {{provider:string|null, lastSync:string|null, status:string}} sync
 */
export function backupNotice(sync, lastBackup, now = Date.now()) {
  if (sync.provider && (recent(sync.lastSync, now) || sync.status === 'syncing')) return null;
  if (recent(lastBackup, now)) return null;
  if (sync.provider) return { key: 'app.noticeSyncOld', vars: { ago: sync.lastSync ? ago(sync.lastSync, now) : '—' } };
  if (lastBackup) return { key: 'app.noticeBackupOld', vars: { ago: ago(lastBackup, now) } };
  return { key: 'app.noticeSetupSync', vars: {} };
}

/** Le rappel est à montrer : rien de récent, et pas masqué ces derniers jours (mémorisé par navigateur). */
export const backupNoticeShown = (sync) =>
  !recentLocal(SNOOZE_KEY, RECENT_DAYS) && !!backupNotice(sync, readLocal(BACKUP_KEY));

/** Bandeau du rappel ; la croix le masque quelques jours. */
export function BackupNotice({ sync, onHide }) {
  const notice = backupNotice(sync, readLocal(BACKUP_KEY));
  if (!notice) return null;
  const hide = () => {
    writeLocal(SNOOZE_KEY, new Date().toISOString());
    onHide();
  };
  return (
    <div class="notice banner backup-notice" role="note">
      <span>{t(notice.key, notice.vars)}</span>
      <a class="btn small primary" href={href('settings/sync')}>
        <Icon name="cloud" /> {sync.provider ? t('sync.manage') : t('sync.setup')}
      </a>
      <a class="btn small" href={href('settings/backup')}>
        {t('app.backUp')}
      </a>
      <button class="icon-btn" aria-label={t('app.hideMessage')} onClick={hide}>
        <Icon name="x" />
      </button>
    </div>
  );
}
