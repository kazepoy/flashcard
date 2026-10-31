import { useEffect, useState } from 'preact/hooks';
import { Icon, ProgressBar } from '../components.jsx';
import { go, href } from '../ctx.js';
import { t } from '../i18n.js';

export function StudyShell({ set, title, progress, options, children }) {
  return (
    <div class="study">
      <header class="study-head">
        <a class="back" href={href(`set/${set.id}`)} aria-label={t('study.backSet')}>
          <Icon name="back" />
          <span>{set.title}</span>
        </a>
        <h1>{title}</h1>
        <div class="study-opts">{options}</div>
      </header>
      {progress && (
        <ProgressBar value={progress.value} max={progress.max} label={progress.label} secondary={progress.secondary} />
      )}
      {progress?.caption && <p class="bar-caption">{progress.caption}</p>}
      <main class="study-main">{children}</main>
    </div>
  );
}

export function StudyEmpty({ set, message }) {
  return (
    <div class="empty">
      <h3>{message || t('study.nothingStudyHere')}</h3>
      <p>{t('study.addCardsTermDefinition')}</p>
      <p>
        <a class="btn primary" href={href(`set/${set.id}/edit`)}>
          {t('common.editSet')}
        </a>
      </p>
    </div>
  );
}

/** Contrôles communs : sens d'étude + étoilées. */
export function DirectionPicker({ value, onChange, starred, onStarred, hasStarred }) {
  return (
    <>
      <label class="field-inline">
        <span>{t('common.direction')}</span>
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          <option value="term">{t('common.directionTermToDef')}</option>
          <option value="def">{t('common.directionDefToTerm')}</option>
          <option value="both">{t('common.directionBoth')}</option>
        </select>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={starred}
          disabled={!hasStarred}
          onChange={(e) => onStarred(e.currentTarget.checked)}
        />
        <span>{t('study.starredOnly')}</span>
      </label>
    </>
  );
}

/** Affiche un écran de fin avec actions. */
export function Finish({ title, children, actions }) {
  return (
    <div class="finish">
      <h2>{title}</h2>
      <div class="finish-body">{children}</div>
      <div class="actions">{actions}</div>
    </div>
  );
}

export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export { go };
