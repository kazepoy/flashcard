// Réglages (#/settings[/<rubrique>]) : rubriques repliables, une seule dépliée à la fois ; chaque rubrique est un
// module de ui/settings/.
import { useEffect, useRef } from 'preact/hooks';
import { t } from './i18n.js';
import { AiSettings } from './settings/ai.jsx';
import { AppearanceSettings, CardDefaults } from './settings/appearance.jsx';
import { BackupSettings } from './settings/backup.jsx';
import { StudySettings } from './settings/study.jsx';
import { SyncSection } from './settings/sync.jsx';

export function SettingsPage({ section = null }) {
  return (
    <div class="settings">
      <h1>{t('common.settings')}</h1>
      <Section id="appearance" title={t('settings.appearance')} open={section}>
        <AppearanceSettings />
      </Section>
      <Section id="cards" title={t('settings.cardDefaults')} open={section}>
        <CardDefaults />
      </Section>
      <Section id="study" title={t('settings.study')} open={section}>
        <StudySettings />
      </Section>
      <Section
        id="sync"
        title={
          <>
            {t('sync.title')} <span class="badge dev">{t('common.beta')}</span>
          </>
        }
        open={section}
      >
        <SyncSection />
      </Section>
      <Section id="backup" title={t('settings.backupRestore')} open={section}>
        <BackupSettings />
      </Section>
      <Section id="ai" title={t('settings.artificialIntelligence')} open={section}>
        <AiSettings />
      </Section>
    </div>
  );
}

/**
 * Rubrique repliable des réglages, repliée par défaut ; une seule dépliée à la fois (déplier l'une replie les
 * autres). Celle nommée dans l'adresse (#/settings/<id>) est dépliée et amenée à l'écran.
 */
function Section({ id, title, open, children }) {
  const ref = useRef();
  useEffect(() => {
    if (open !== id || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ block: 'start' });
  }, [open, id]);
  return (
    <details
      ref={ref}
      class="panel settings-section"
      id={'settings-' + id}
      onToggle={(e) => {
        if (!e.currentTarget.open) return;
        for (const d of document.querySelectorAll('.settings-section[open]')) if (d !== e.currentTarget) d.open = false;
      }}
    >
      <summary>
        <h2>{title}</h2>
      </summary>
      <div class="settings-body">{children}</div>
    </details>
  );
}
