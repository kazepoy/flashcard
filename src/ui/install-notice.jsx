// Bandeau de la bibliothèque : données de cet appareil à la merci du navigateur (Safari : 7 jours sans visite ;
// ailleurs : manque de place). Propose d'installer l'application, avec le geste propre à l'appareil, ou à défaut
// de protéger le stockage ; et toujours la synchronisation Dropbox, qui permet de tout retrouver après un
// effacement. Masquable quelques jours.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './components.jsx';
import { href } from './ctx.js';
import { t } from './i18n.js';
import {
  canPromptInstall,
  installPlatform,
  onInstallChange,
  promptInstall,
  requestPersistence,
  separateStorage,
  storageRisk,
} from './install.js';
import { recentLocal, writeLocal } from './local.js';

const SNOOZE_KEY = 'flashcard.installNoticeSnooze';
const SNOOZE_DAYS = 14;

/**
 * Risque d'effacement ('weekly' | 'space' | null ; undefined tant qu'il n'est pas connu), réévalué à l'arrivée
 * de l'invite d'installation ou après installation.
 */
export function useStorageRisk() {
  const [risk, setRisk] = useState(undefined);
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () => storageRisk().then((r) => alive && (setRisk(r), bump((n) => n + 1)));
    check();
    const off = onInstallChange(check);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return risk;
}

/** Le bandeau est à montrer : risque d'effacement, et pas masqué ces derniers jours (mémorisé par navigateur). */
export const installNoticeShown = (risk) => !!risk && !recentLocal(SNOOZE_KEY, SNOOZE_DAYS);

/** Comment installer, selon l'appareil (clé de traduction) ; null : pas d'installation possible. */
const HOW = {
  ios: 'install.how.ios',
  'mac-safari': 'install.how.macSafari',
  'firefox-android': 'install.how.firefoxAndroid',
  chromium: 'install.how.chromium',
  'firefox-desktop': null,
  other: null,
};

export function InstallNotice({ risk, sync, onHide }) {
  const platform = installPlatform();
  const [refused, setRefused] = useState(false);
  const hide = () => {
    writeLocal(SNOOZE_KEY, new Date().toISOString());
    onHide();
  };
  // installée : l'application s'ouvre dans sa fenêtre, cet onglet reste un onglet (le bandeau n'y a plus lieu)
  const install = async () => {
    if (await promptInstall()) hide();
  };
  const protect = async () => {
    if (await requestPersistence({ fromClick: true })) onHide();
    else setRefused(true);
  };
  const prompt = canPromptInstall();
  const how = HOW[platform];
  // Firefox (ordinateur et Android) demande à l'utilisateur d'autoriser le stockage persistant
  const canProtect = risk === 'space' && platform.startsWith('firefox');
  return (
    <div class="notice banner install-notice" role="note">
      <span>
        {t(risk === 'weekly' ? 'install.riskWeekly' : 'install.riskSpace')}{' '}
        {prompt ? t('install.offer') : how ? t(how) : canProtect ? t('install.protectOffer') : t('install.fallback')}
        {refused && <> {t('install.refused')}</>}{' '}
        {/* application installée à part (iPhone, iPad, Mac Safari) : y connecter Dropbox pour y retrouver tout */}
        {(prompt || how) && separateStorage(platform)
          ? t('install.separate')
          : sync.provider
            ? t('install.synced')
            : t('install.syncOffer')}
      </span>
      {prompt && (
        <button class="btn small primary" onClick={install}>
          <Icon name="download" /> {t('install.install')}
        </button>
      )}
      {canProtect && !refused && (
        <button class={'btn small' + (prompt || how ? '' : ' primary')} onClick={protect}>
          <Icon name="lock" /> {t('install.protect')}
        </button>
      )}
      {/* toujours : avec Dropbox, la bibliothèque se retrouve même après un effacement */}
      <a class={'btn small' + (prompt || canProtect ? '' : ' primary')} href={href('settings/sync')}>
        <Icon name="cloud" /> {sync.provider ? t('sync.manage') : t('install.syncButton')}
      </a>
      <button class="icon-btn" aria-label={t('app.hideMessage')} onClick={hide}>
        <Icon name="x" />
      </button>
    </div>
  );
}
