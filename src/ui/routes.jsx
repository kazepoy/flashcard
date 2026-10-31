// Pages de l'application selon l'adresse (#/…).
import { BrowsePage } from './browse.jsx';
import { Empty } from './components.jsx';
import { href } from './ctx.js';
import { Editor } from './editor.jsx';
import { HelpPage } from './help.jsx';
import { errorText, t } from './i18n.js';
import { LibraryPage } from './library.jsx';
import { PrintPage } from './print.jsx';
import { SetPage } from './setpage.jsx';
import { SettingsPage } from './settings.jsx';
import { StatsPage } from './stats.jsx';
import { SyncPage } from './sync-page.jsx';
import { Flashcards } from './study/flashcards.jsx';
import { GravityMode } from './study/gravity.jsx';
import { Learn } from './study/learn.jsx';
import { MatchGame } from './study/match.jsx';
import { Review } from './study/review.jsx';
import { TestMode } from './study/test.jsx';
import { WriteMode } from './study/write.jsx';
import { useSetData } from './useSet.js';

const STUDY = {
  review: Review,
  flashcards: Flashcards,
  learn: Learn,
  write: (p) => <WriteMode {...p} />,
  spell: (p) => <WriteMode {...p} spell />,
  test: TestMode,
  match: MatchGame,
  gravity: GravityMode,
};

function StudyPage({ setId, mode, variant }) {
  const data = useSetData(setId);
  const Mode = STUDY[mode];
  if (data.loading) return <p class="muted pad">{t('common.loading')}</p>;
  if (!Mode || data.error || !data.set) {
    return (
      <Empty title={t('common.setNotFound')}>
        <p>{data.error && errorText(data.error)}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  }
  return (
    <Mode
      key={mode + setId + (variant || '')}
      set={data.set}
      progress={data.progress}
      update={data.update}
      log={data.log}
      variant={variant}
    />
  );
}

export function Routes({ route: r }) {
  switch (r.page) {
    case 'settings':
      return <SettingsPage />;
    case 'help':
      return <HelpPage />;
    case 'sync':
      return <SyncPage />;
    case 'stats':
      return <StatsPage key={r.setId || ''} setId={r.setId} />;
    case 'browse':
      return <BrowsePage initialQuery={r.query} />;
    case 'edit':
      return <Editor key={r.setId} setId={r.setId} focusCardId={r.cardId} />;
    case 'print':
      return <PrintPage key={r.setId} setId={r.setId} />;
    case 'study':
      return <StudyPage key={r.setId + r.mode + (r.variant || '')} setId={r.setId} mode={r.mode} variant={r.variant} />;
    case 'set':
      return <SetPage key={r.setId} setId={r.setId} />;
    default:
      return <LibraryPage />;
  }
}
