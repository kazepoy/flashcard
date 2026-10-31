import { useRef, useState } from 'preact/hooks';
import { buildMatchBoard, isMatch, matchScoreMs } from '../../core/games.js';
import { recordAnswer } from '../../core/progress.js';
import { stripMarkdown } from '../../core/text.js';
import { MediaImage } from '../components.jsx';
import { t } from '../i18n.js';
import { useItems } from '../useSet.js';
import { DirectionPicker, Finish, StudyEmpty, StudyShell, useNow } from './shell.jsx';

const fmt = (ms) => (ms / 1000).toFixed(1) + ' s';

export function MatchGame({ set, progress, update, log }) {
  const [direction, setDirection] = useState('term');
  const [starredOnly, setStarredOnly] = useState(false);
  const [gen, setGen] = useState(0);
  const items = useItems(set, progress, { direction, starredOnly, need: 'plain' });
  const hasStarred = Object.keys(progress.starred).length > 0;
  const options = (
    <DirectionPicker
      value={direction}
      onChange={setDirection}
      starred={starredOnly}
      onStarred={setStarredOnly}
      hasStarred={hasStarred}
    />
  );
  if (items.length < 3) {
    return (
      <StudyShell set={set} title={t('mode.match')} options={options}>
        <StudyEmpty set={set} message={t('study.needLeast3Cards')} />
      </StudyShell>
    );
  }
  return (
    <MatchRun
      key={[direction, starredOnly, gen].join('|')}
      {...{ set, progress, update, log, items, options, again: () => setGen((g) => g + 1) }}
    />
  );
}

function MatchRun({ set, progress, update, log, items, options, again }) {
  const [board] = useState(() => buildMatchBoard(items, Math.min(6, items.length)));
  const [sel, setSel] = useState(null);
  const [gone, setGone] = useState(new Set());
  const [bad, setBad] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const start = useRef(Date.now());
  const [final, setFinal] = useState(null);
  const now = useNow(100, final === null);
  const elapsed = final ?? now - start.current;

  const finish = () => {
    const total = matchScoreMs(Date.now() - start.current, mistakes);
    setFinal(total);
    update((p) => {
      const g = (p.games.match ||= {});
      g.bestMs = Math.min(g.bestMs ?? Infinity, total);
      g.last = total;
    });
    log({ t: new Date().toISOString(), item: '*', mode: 'match', rating: 3, ms: total });
  };

  const click = (tile) => {
    if (gone.has(tile.key) || bad.length) return;
    if (!sel) return setSel(tile);
    if (sel.key === tile.key) return setSel(null);
    if (isMatch(sel, tile)) {
      const next = new Set([...gone, sel.key, tile.key]);
      setGone(next);
      update((p) => recordAnswer(p, tile.pairId, true));
      setSel(null);
      if (next.size === board.length) finish();
    } else {
      setMistakes((m) => m + 1);
      update((p) => {
        recordAnswer(p, tile.pairId, false);
        recordAnswer(p, sel.pairId, false);
      });
      setBad([sel.key, tile.key]);
      setTimeout(() => (setBad([]), setSel(null)), 450);
    }
  };

  const best = progress.games.match?.bestMs;
  return (
    <StudyShell set={set} title={t('mode.match')} options={options}>
      <div class="match">
        <div class="match-info">
          <span class="timer" aria-live="off">
            {fmt(elapsed + mistakes * 1000)}
          </span>
          <span>{t('study.mistakes1SEach', { n: mistakes })}</span>
          {best != null && best !== Infinity && <span>{t('study.best', { s: fmt(best) })}</span>}
        </div>
        {final !== null ? (
          <Finish
            title={t('study.finished', { s: fmt(final) })}
            actions={
              <>
                <button class="btn primary" onClick={again}>
                  {t('study.playAgain')}
                </button>
                <a class="btn" href={`#/set/${set.id}`}>
                  {t('study.backSet')}
                </a>
              </>
            }
          >
            <p>{final <= (best ?? Infinity) ? t('study.newRecord') : t('study.best', { s: fmt(best) })}</p>
          </Finish>
        ) : (
          <div class="tiles" role="group" aria-label={t('study.tilesMatch')}>
            {board.map((tile) => (
              <button
                key={tile.key}
                class={
                  'tile' +
                  (gone.has(tile.key) ? ' gone' : '') +
                  (sel?.key === tile.key ? ' sel' : '') +
                  (bad.includes(tile.key) ? ' bad' : '')
                }
                aria-pressed={sel?.key === tile.key}
                aria-hidden={gone.has(tile.key)}
                tabIndex={gone.has(tile.key) ? -1 : 0}
                onClick={() => click(tile)}
              >
                <span>{stripMarkdown(tile.text).slice(0, 90)}</span>
                {tile.image && <MediaImage path={tile.image} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </StudyShell>
  );
}
