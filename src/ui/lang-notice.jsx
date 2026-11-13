// Bandeau discret au premier lancement : indique la langue détectée et propose l'autre langue (sans popup).
import { Icon } from './components.jsx';
import { useApp } from './ctx.js';
import { examplesNoticeShown } from './examples.jsx';
import { switchFirstRunTour } from './first-run.js';
import { t } from './i18n.js';
import { readLocal, writeLocal } from './local.js';

const NOTICE_KEY = 'flashcard.langNotice';

/** L'invite de langue a été vue (fermée ou changée) : elle ne revient plus. */
export const langNoticeSeen = () => writeLocal(NOTICE_KEY, 'seen');

/** À montrer au premier lancement seulement (tant que ni elle ni l'annonce des exemples n'ont été vues). */
export const langNoticeShown = () => readLocal(NOTICE_KEY) !== 'seen' && examplesNoticeShown();

export function LangNotice({ onHide }) {
  const { lib, settings, saveSettings, refresh } = useApp();
  const current = settings.lang === 'fr' ? 'fr' : 'en';
  const next = current === 'fr' ? 'en' : 'fr';

  const hide = () => (langNoticeSeen(), onHide());
  const choose = async () => {
    langNoticeSeen();
    await saveSettings({ ...settings, lang: next, language: { term: next, definition: next } });
    try {
      if (await switchFirstRunTour(lib, current, next)) refresh();
    } catch (e) {
      console.warn('Visite guidée non remplacée', e);
    }
    onHide();
  };

  return (
    <div class="notice lang-notice" role="note">
      <Icon name="globe" size={20} />
      <span>{t('lang.notice')}</span>
      <button class="btn small primary" onClick={choose}>
        {t('lang.noticeSwitch')}
      </button>
      <button class="icon-btn" aria-label={t('app.hideMessage')} onClick={hide}>
        <Icon name="x" />
      </button>
    </div>
  );
}
