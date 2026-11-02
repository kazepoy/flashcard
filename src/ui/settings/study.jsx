// Réglages › Étude : limites du jour, rétention visée, fautes de frappe, lecture à voix haute (partagés).
import { useApp } from '../ctx.js';
import { t } from '../i18n.js';

export function StudySettings() {
  const { settings, saveSettings } = useApp();
  const set = (patch) => saveSettings({ ...settings, ...patch });
  return (
    <>
      <p class="muted small">
        {t('settings.studyIntro')}{' '}
        <a href={t('help.spacedRepetitionUrl')} target="_blank" rel="noopener noreferrer">
          {t('settings.studyLearnMore')}
        </a>
      </p>
      <div class="grid-2">
        <label class="field">
          <span>{t('settings.newCardsPerDay', { n: settings.newPerDay })}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.newPerDay}
            onInput={(e) => set({ newPerDay: Number(e.currentTarget.value) })}
          />
        </label>
        <label class="field">
          <span>{t('settings.maximumReviewsPerDay', { n: settings.reviewsPerDay })}</span>
          <input
            type="range"
            min="20"
            max="500"
            step="10"
            value={settings.reviewsPerDay}
            onInput={(e) => set({ reviewsPerDay: Number(e.currentTarget.value) })}
          />
        </label>
        <label class="field">
          <span>{t('settings.targetRetention', { n: Math.round(settings.retention * 100) })}</span>
          <input
            type="range"
            min="0.7"
            max="0.97"
            step="0.01"
            value={settings.retention}
            onInput={(e) => set({ retention: Number(e.currentTarget.value) })}
          />
          <small class="muted">{t('settings.higherMoreFrequentReviews')}</small>
        </label>
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.typoTolerance}
          onChange={(e) => set({ typoTolerance: e.currentTarget.checked })}
        />
        <span>{t('settings.flagLikelyTyposInstead')}</span>
      </label>
      <label class="check">
        <input type="checkbox" checked={settings.tts} onChange={(e) => set({ tts: e.currentTarget.checked })} />
        <span>{t('settings.readAloudButtonsBrowser')}</span>
      </label>
    </>
  );
}
