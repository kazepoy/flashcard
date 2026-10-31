// Aide et crédits (#/help) : présentation, confidentialité, prise en main, code source et logiciels libres.
import { Icon } from './components.jsx';
import { href } from './ctx.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/kazepoy/flashcard';
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';

const PROMISES = [
  ['lock', 'help.pLocalTitle', 'help.pLocal'],
  ['eyeOff', 'help.pTrackTitle', 'help.pTrack'],
  ['offline', 'help.pOfflineTitle', 'help.pOffline'],
  ['file', 'help.pOpenTitle', 'help.pOpen'],
];
const STEPS = [
  ['help.step1Title', 'help.step1'],
  ['help.step2Title', 'help.step2'],
  ['help.step3Title', 'help.step3'],
];
const LIBS = [
  ['Preact', 'https://preactjs.com', 'MIT', 'help.lib.preact'],
  ['ts-fsrs', 'https://github.com/open-spaced-repetition/ts-fsrs', 'MIT', 'help.lib.fsrs'],
  ['sql.js', 'https://github.com/sql-js/sql.js', 'MIT', 'help.lib.sqljs'],
  ['JSZip', 'https://stuk.github.io/jszip/', 'MIT', 'help.lib.jszip'],
  ['fzstd', 'https://github.com/101arrowz/fzstd', 'MIT', 'help.lib.fzstd'],
  ['PDF.js', 'https://mozilla.github.io/pdf.js/', 'Apache-2.0', 'help.lib.pdfjs'],
  ['OpenDyslexic', 'https://opendyslexic.org', 'OFL-1.1', 'help.lib.readingFont'],
  ['Atkinson Hyperlegible', 'https://www.brailleinstitute.org/freefont/', 'OFL-1.1', 'help.lib.readingFont'],
  ['Lexend', 'https://www.lexend.com', 'OFL-1.1', 'help.lib.readingFont'],
  ['Andika', 'https://software.sil.org/andika/', 'OFL-1.1', 'help.lib.readingFont'],
];

/** Logo GitHub (marque officielle, tracé plein). */
const GitHubMark = () => (
  <svg class="icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const external = { target: '_blank', rel: 'noopener noreferrer' };

export function HelpPage() {
  return (
    <div class="help">
      <header class="help-hero">
        <span class="brand-card help-logo" aria-hidden="true" />
        <div class="help-intro">
          <h1>Flashcard</h1>
          <p class="help-tagline">{t('help.tagline')}</p>
          {VERSION && <p class="muted small">{t('help.version', { v: VERSION, build: BUILD })}</p>}
        </div>
        <div class="help-links">
          <a class="btn primary" href={REPO} {...external}>
            <GitHubMark /> {t('help.github')}
          </a>
          <a class="btn" href={`${REPO}/issues`} {...external}>
            {t('help.issues')}
          </a>
        </div>
      </header>

      <section aria-labelledby="help-privacy">
        <h2 id="help-privacy">{t('help.privacyTitle')}</h2>
        <ul class="help-tiles">
          {PROMISES.map(([icon, title, text]) => (
            <li key={icon}>
              <Icon name={icon} size={22} />
              <strong>{t(title)}</strong>
              <span>{t(text)}</span>
            </li>
          ))}
        </ul>
        <p class="muted small">
          {t('help.privacyExceptions')} {t('help.privacyBackup')} <a href={href('settings')}>{t('common.settings')}</a>
        </p>
      </section>

      <section aria-labelledby="help-start">
        <h2 id="help-start">{t('help.startTitle')}</h2>
        <ol class="help-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span class="help-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <strong>{t(title)}</strong>
              <span>{t(text)}</span>
            </li>
          ))}
        </ol>
        <p class="muted small">{t('help.tourHint')}</p>
      </section>

      <footer class="help-credits">
        <p>
          {t('help.builtWith')}{' '}
          {LIBS.map(([name, url, license, key]) => (
            <a key={name} class="chip" href={url} title={`${t(key)} — ${license}`} {...external}>
              {name}
            </a>
          ))}
        </p>
        <p class="muted small">
          {t('help.license')}{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" {...external}>
            GNU AGPL-3.0
          </a>
          . {t('help.creditsInspiration')}
        </p>
      </footer>
    </div>
  );
}
