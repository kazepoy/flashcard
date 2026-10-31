import { useState } from 'preact/hooks';
import { Icon } from './components.jsx';
import { href } from './ctx.js';
import { t } from './i18n.js';

const NOTICE_KEY = 'flashcard.storageNotice';

/** Données dans le navigateur seulement : rappel de sauvegarder (masquable, mémorisé par navigateur). */
export function StorageNotice() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_KEY) === 'hidden';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(NOTICE_KEY, 'hidden');
    } catch {
      /* stockage local indisponible : masqué pour cette session */
    }
  };
  return (
    <div class="notice banner storage-notice" role="note">
      <span>{t('app.setsStoredBrowserNot')}</span>
      <a class="btn small" href={href('settings')}>
        {t('app.backUp')}
      </a>
      <button class="icon-btn" aria-label={t('app.hideMessage')} onClick={hide}>
        <Icon name="x" />
      </button>
    </div>
  );
}
