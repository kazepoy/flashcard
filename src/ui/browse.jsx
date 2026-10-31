// Navigateur de cartes : toutes les cartes de la bibliothèque, recherche, drapeaux, infos par carte.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { setSuspended, toggleStar } from '../core/progress.js';
import { FLAGS, buildRows, cardHistory, rowSummary, search, setFlag, sortRows } from '../core/search.js';
import { Scheduler, SrsState } from '../core/srs.js';
import { Empty, Icon, Md } from './components.jsx';
import { href, parseRoute, useApp, useAsync } from './ctx.js';
import { errorText, locale, percent, t, tn } from './i18n.js';

const PAGE = 200;

const QUICK = [
  { q: 'is:due', label: 'common.due' },
  { q: 'is:new', label: 'common.new' },
  { q: 'is:starred', label: 'browse.starredFilter' },
  { q: 'is:flagged', label: 'browse.flagged' },
  { q: 'prop:lapses>=4', label: 'browse.oftenForgotten' },
  { q: 'is:dupe', label: 'browse.duplicates' },
  { q: 'is:suspended', label: 'browse.suspendedFilter' },
  { q: 'added:7', label: 'browse.addedWeek' },
];

const SORTS = [
  ['added', 'browse.sort.added'],
  ['term', 'browse.sort.term'],
  ['def', 'browse.sort.def'],
  ['set', 'browse.sort.set'],
  ['due', 'browse.sort.due'],
  ['lapses', 'browse.sort.lapses'],
  ['reps', 'browse.sort.reps'],
];

const STATE_LABEL = { new: 'srs.state.new', learn: 'srs.state.learn', review: 'srs.state.review' };
const SRS_STATE_LABEL = {
  [SrsState.New]: 'srs.state.new',
  [SrsState.Learning]: 'srs.state.learn',
  [SrsState.Review]: 'srs.state.review',
  [SrsState.Relearning]: 'srs.state.relearn',
};
const RATING_LABEL = { 1: 'srs.rating.again', 2: 'srs.rating.hard', 3: 'srs.rating.good', 4: 'srs.rating.easy' };

/** Requête placée dans l'URL (#/browse/<requête>) sans déclencher de navigation. */
const writeQueryToUrl = (q) => history.replaceState(null, '', '#/browse' + (q ? '/' + encodeURIComponent(q) : ''));

const NONE = []; // référence stable tant que rien n'est chargé

export function BrowsePage({ initialQuery = '' }) {
  const { lib, version, settings, toast } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [sort, setSort] = useState({ by: 'added', desc: true });
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState(() => new Set());
  const [current, setCurrent] = useState(null);
  const [, bump] = useState(0);
  const scheduler = useMemo(() => new Scheduler({ retention: settings.retention }), [settings.retention]);

  const { data, loading, error } = useAsync(async () => {
    const { sets } = await lib.listSets();
    const libs = [];
    for (const s of sets) libs.push({ set: await lib.loadSet(s.id), progress: await lib.loadProgress(s.id) });
    return { rows: buildRows(libs.filter((x) => x.set)), setCount: libs.length };
  }, [lib, version]);

  // navigation vers #/browse/<autre requête> (lien, menu) alors que la page est déjà ouverte
  useEffect(() => {
    const f = () => {
      const r = parseRoute();
      if (r[0] !== 'browse') return;
      const q = r.slice(1).join('/');
      setQuery((cur) => (cur.trim() === q ? cur : q));
    };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
      setLimit(PAGE);
      writeQueryToUrl(query.trim());
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const all = data?.rows ?? NONE;
  const results = useMemo(() => {
    const now = new Date();
    const found = search(all, debounced, { now, retrievability: (s, n) => scheduler.retrievability(s, n) });
    return sortRows(found, sort.by, sort.desc, now);
  }, [all, debounced, sort, scheduler]);
  const shown = results.slice(0, limit);
  const cur = current && all.find((r) => r.key === current);

  const persist = async (rows) => {
    bump((n) => n + 1);
    const byProgress = new Set(rows.map((r) => r.progress));
    try {
      for (const p of byProgress) await lib.saveProgress(p);
    } catch (e) {
      toast(errorText(e), 'bad');
    }
  };
  const flagRows = (rows, n) => {
    const now = new Date();
    for (const r of rows) {
      setFlag(r.progress, r.card.id, n, now);
      r.flag = n;
    }
    persist(rows);
  };
  const starRows = (rows, on) => {
    for (const r of rows) {
      if (!!r.progress.starred[r.card.id] !== on) toggleStar(r.progress, r.card.id);
      r.starred = on;
    }
    persist(rows);
  };
  const suspendRows = (rows, on) => {
    const now = new Date();
    for (const r of rows) {
      setSuspended(r.progress, r.card.id, on, now);
      r.suspended = on;
    }
    persist(rows);
  };
  const selRows = all.filter((r) => selected.has(r.key));
  const toggleSel = (key) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.key));

  if (error)
    return (
      <p class="notice bad" role="alert">
        {errorText(error)}
      </p>
    );
  if (loading && !data) return <p class="muted pad">{t('common.loading')}</p>;
  if (!all.length) {
    return (
      <Empty title={t('common.noCards')}>
        <p>{t('browse.createImportSetCards')}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  }

  return (
    <div class="browse">
      <header class="lib-head">
        <div>
          <h1>{t('common.cards')}</h1>
          <p class="muted" role="status">
            {debounced.trim()
              ? t('browse.nOfM', { n: results.length, m: all.length })
              : tn('common.nCards', all.length)}
            {' · '}
            {tn('browse.sets', data.setCount)}
          </p>
        </div>
      </header>

      <div class="browse-search">
        <label class="search">
          <span class="sr-only">{t('browse.searchCards')}</span>
          <input
            type="search"
            value={query}
            placeholder={t('browse.searchPlaceholder')}
            onInput={(e) => setQuery(e.currentTarget.value)}
            autoFocus
          />
        </label>
        <label class="field-inline sort">
          <span>{t('browse.sort')}</span>
          <select
            value={sort.by}
            onChange={(e) =>
              setSort({ by: e.currentTarget.value, desc: ['added', 'lapses', 'reps'].includes(e.currentTarget.value) })
            }
          >
            {SORTS.map(([id, l]) => (
              <option key={id} value={id}>
                {t(l)}
              </option>
            ))}
          </select>
          <button
            class="icon-btn"
            aria-label={sort.desc ? t('browse.descending') : t('browse.ascending')}
            title={sort.desc ? t('browse.descending') : t('browse.ascending')}
            onClick={() => setSort((s) => ({ ...s, desc: !s.desc }))}
          >
            <Icon name={sort.desc ? 'down' : 'up'} />
          </button>
        </label>
      </div>
      <div class="chips" role="group" aria-label={t('browse.quickSearches')}>
        {QUICK.map((x) => (
          <button
            key={x.q}
            class={'chip' + (query.trim() === x.q ? ' on' : '')}
            aria-pressed={query.trim() === x.q}
            onClick={() => setQuery(query.trim() === x.q ? '' : x.q)}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <SearchHelp />

      {selected.size > 0 && (
        <div class="selbar" role="region" aria-label={t('browse.selection')}>
          <strong>{tn('browse.selected', selected.size)}</strong>
          <FlagPicker value={null} onChange={(n) => flagRows(selRows, n)} />
          <button class="btn small" onClick={() => starRows(selRows, true)}>
            <Icon name="star" /> {t('common.star')}
          </button>
          <button class="btn small" onClick={() => starRows(selRows, false)}>
            {t('browse.unstar')}
          </button>
          <button class="btn small" onClick={() => suspendRows(selRows, true)}>
            <Icon name="pause" /> {t('common.suspend')}
          </button>
          <button class="btn small" onClick={() => suspendRows(selRows, false)}>
            {t('common.unsuspend')}
          </button>
          <button class="btn small" onClick={() => setSelected(new Set())}>
            {t('browse.deselect')}
          </button>
        </div>
      )}

      <div class={'browse-body' + (cur ? ' with-info' : '')}>
        <div class="browse-list">
          {results.length === 0 ? (
            <Empty title={t('common.noResults')}>
              <p>{t('browse.noCardMatches', { q: debounced })}</p>
            </Empty>
          ) : (
            <table class="btable">
              <thead>
                <tr>
                  <th class="c-sel">
                    <input
                      type="checkbox"
                      aria-label={t('browse.selectAll')}
                      checked={allShownSelected}
                      onChange={() =>
                        setSelected(allShownSelected ? new Set() : new Set([...selected, ...shown.map((r) => r.key)]))
                      }
                    />
                  </th>
                  <th class="c-term">{t('browse.sort.term')}</th>
                  <th class="c-def">{t('browse.sort.def')}</th>
                  <th class="c-set">{t('browse.sort.set')}</th>
                  <th class="c-due">{t('browse.sort.due')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Row
                    key={r.key}
                    row={r}
                    active={r.key === current}
                    checked={selected.has(r.key)}
                    onCheck={() => toggleSel(r.key)}
                    onOpen={() => setCurrent(r.key === current ? null : r.key)}
                  />
                ))}
              </tbody>
            </table>
          )}
          {results.length > limit && (
            <p class="center">
              <button class="btn" onClick={() => setLimit((l) => l + PAGE)}>
                {t('browse.showMore', { n: Math.min(PAGE, results.length - limit) })}
              </button>
            </p>
          )}
        </div>
        {cur && (
          <CardInfo
            row={cur}
            scheduler={scheduler}
            onClose={() => setCurrent(null)}
            onFlag={(n) => flagRows([cur], n)}
            onStar={() => starRows([cur], !cur.starred)}
            onSuspend={() => suspendRows([cur], !cur.suspended)}
          />
        )}
      </div>
    </div>
  );
}

const dueFmt = () => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });

function Row({ row, active, checked, onCheck, onOpen }) {
  const s = row._sum || rowSummary(row);
  const flag = FLAGS.find((f) => f.n === row.flag);
  return (
    <tr
      class={(active ? 'active' : '') + (row.suspended ? ' suspended' : '')}
      style={flag ? { '--flag': flag.hex } : undefined}
    >
      <td class="c-sel">
        <input type="checkbox" aria-label={t('browse.select')} checked={checked} onChange={onCheck} />
      </td>
      <td class="c-term">
        <button class="row-open" onClick={onOpen} aria-expanded={active}>
          {flag && <span class="flag-dot" aria-label={t('browse.flagNamed', { c: t(`flag.${flag.id}`) })} />}
          {row.starred && (
            <span class="star-mark" aria-label={t('browse.starred')}>
              ★
            </span>
          )}
          {row.suspended && <span class="badge">{t('common.suspended')}</span>}
          <span class="clip">
            {row.display.term || (row.card.type === 'occlusion' ? t('common.cardTypeOcclusion') : '—')}
          </span>
        </button>
      </td>
      <td class="c-def">
        <span class="clip">{row.display.def}</span>
      </td>
      <td class="c-set">
        <span class="clip">{row.set.title}</span>
      </td>
      <td class={'c-due' + (s.isDue ? ' due' : '')}>
        {s.state === 'new' ? (
          <span class="muted">{t('srs.state.new')}</span>
        ) : s.isDue ? (
          t('common.due')
        ) : (
          dueFmt().format(new Date(s.due))
        )}
      </td>
    </tr>
  );
}

function FlagPicker({ value, onChange }) {
  return (
    <span class="flag-picker" role="group" aria-label={t('browse.flag')}>
      {FLAGS.map((f) => (
        <button
          key={f.n}
          class={'flag-btn' + (value === f.n ? ' on' : '')}
          style={{ '--flag': f.hex }}
          aria-pressed={value === f.n}
          aria-label={t('browse.flagNamed', { c: t(`flag.${f.id}`) })}
          title={t(`flag.${f.id}`)}
          onClick={() => onChange(value === f.n ? 0 : f.n)}
        />
      ))}
      <button
        class="flag-btn none"
        aria-label={t('browse.removeFlag')}
        title={t('browse.removeFlag')}
        onClick={() => onChange(0)}
      >
        <Icon name="x" size={14} />
      </button>
    </span>
  );
}

function itemLabel(id, card) {
  if (id.includes('#c')) return t('browse.blank', { n: id.split('#c')[1] });
  if (id.includes('#o')) return t('browse.mask', { n: id.split('#o')[1] });
  if (id.endsWith('~r')) return t('common.directionDefToTerm');
  return card.type === 'cloze' ? '' : t('common.directionTermToDef');
}

function CardInfo({ row, scheduler, onClose, onFlag, onStar, onSuspend }) {
  const { lib } = useApp();
  const { card, set } = row;
  const { data: log } = useAsync(() => lib.readLog(set.id), [lib, set.id]);
  const history = log ? cardHistory(log, card.id) : [];
  const now = new Date();
  const dtf = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });
  const df = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' });
  const nf = new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 });
  const s = rowSummary(row, now);
  return (
    <aside class="panel card-info" aria-label={t('browse.cardInfo')}>
      <header>
        <h2>{t('browse.card')}</h2>
        <button class="icon-btn" aria-label={t('common.close')} onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <div class="ci-faces">
        <Md text={card.term} extraMedia={[card.termImage || '']} />
        <Md text={card.definition} />
      </div>
      <p class="ci-actions">
        <a class="btn small" href={href(`set/${set.id}/edit/${card.id}`)}>
          <Icon name="edit" /> {t('common.edit')}
        </a>
        <a class="btn small" href={href(`set/${set.id}`)}>
          {set.title}
        </a>
        <button class={'btn small' + (row.starred ? ' on' : '')} aria-pressed={row.starred} onClick={onStar}>
          <Icon name="star" fill={row.starred} /> {row.starred ? t('browse.starred') : t('common.star')}
        </button>
        <button
          class={'btn small' + (row.suspended ? ' on' : '')}
          aria-pressed={row.suspended}
          title={t('common.suspendHint')}
          onClick={onSuspend}
        >
          <Icon name="pause" /> {row.suspended ? t('common.unsuspend') : t('common.suspend')}
        </button>
      </p>
      <div class="ci-flag">
        <span class="lbl">{t('browse.flag')}</span>
        <FlagPicker value={row.flag} onChange={onFlag} />
      </div>
      <dl class="kv">
        <div>
          <dt>{t('browse.added')}</dt>
          <dd>{row.added ? df.format(new Date(row.added)) : '—'}</dd>
        </div>
        <div>
          <dt>{t('browse.state')}</dt>
          <dd>{t(STATE_LABEL[s.state])}</dd>
        </div>
        {s.lastReview && (
          <div>
            <dt>{t('browse.lastReview')}</dt>
            <dd>{df.format(new Date(s.lastReview))}</dd>
          </div>
        )}
        {row.dupe && (
          <div>
            <dt>{t('browse.duplicate')}</dt>
            <dd>{t('browse.sameTermAnotherCard')}</dd>
          </div>
        )}
      </dl>
      {row.items.some((x) => x.it?.srs) && (
        <div class="ci-items">
          <h3>{t('browse.fsrsScheduling')}</h3>
          {row.items
            .filter((x) => x.it?.srs)
            .map(({ id, it }) => (
              <section key={id} class="ci-item">
                {itemLabel(id, card) && <h4>{itemLabel(id, card)}</h4>}
                <dl class="kv compact">
                  <div>
                    <dt>{t('browse.state')}</dt>
                    <dd>{SRS_STATE_LABEL[it.srs.state] ? t(SRS_STATE_LABEL[it.srs.state]) : ''}</dd>
                  </div>
                  <div>
                    <dt>{t('browse.sort.due')}</dt>
                    <dd>{df.format(new Date(it.srs.due))}</dd>
                  </div>
                  <div>
                    <dt>{t('browse.stability')}</dt>
                    <dd>{tn('common.days', Math.round(it.srs.stability))}</dd>
                  </div>
                  <div>
                    <dt>{t('browse.difficultyScale')}</dt>
                    <dd>{nf.format(it.srs.difficulty)}</dd>
                  </div>
                  <div>
                    <dt>{t('browse.recallProbability')}</dt>
                    <dd>{percent(Math.round(scheduler.retrievability(it.srs, now) * 100))}</dd>
                  </div>
                  <div>
                    <dt>{t('browse.reviewsLapses')}</dt>
                    <dd>
                      {it.srs.reps} / {it.srs.lapses}
                    </dd>
                  </div>
                </dl>
              </section>
            ))}
        </div>
      )}
      <h3>{t('browse.history')}</h3>
      {!log ? (
        <p class="muted">{t('common.loading')}</p>
      ) : history.length === 0 ? (
        <p class="muted">{t('browse.neverStudied')}</p>
      ) : (
        <ol class="history">
          {history.slice(0, 50).map((l, i) => (
            <li key={i}>
              <time dateTime={l.t}>{dtf.format(new Date(l.t))}</time>
              <span class={'rating r' + l.rating}>{RATING_LABEL[l.rating] ? t(RATING_LABEL[l.rating]) : '?'}</span>
              <span class="muted">
                {l.mode ? t(`mode.${l.mode === 'srs' ? 'review' : l.mode}`) : ''}
                {itemLabel(l.item, card) && ` · ${itemLabel(l.item, card)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function SearchHelp() {
  const rows = [
    ['chien', 'browse.syntax.text'],
    ['"la mesa"', 'browse.syntax.phrase'],
    ['ch*n', 'browse.syntax.wildcard'],
    ['-chat', 'browse.syntax.exclude'],
    ['chien or chat', 'browse.syntax.or'],
    ['term:x  def:x', 'browse.syntax.field'],
    ['set:espagnol', 'browse.syntax.set'],
    ['tag:verbe', 'browse.syntax.tag'],
    ['is:due  is:new  is:learn  is:review', 'browse.syntax.state'],
    ['is:starred  is:flagged  flag:1', 'browse.syntax.flags'],
    ['is:suspended', 'browse.syntax.suspended'],
    ['is:cloze  is:occlusion  is:dupe', 'browse.syntax.type'],
    ['has:image  has:audio  has:hint', 'browse.syntax.has'],
    ['added:7  rated:1', 'browse.syntax.dates'],
    ['prop:lapses>3  prop:ivl>=30', 'browse.syntax.props'],
    ['prop:due<=1  prop:r<70', 'browse.syntax.dueRecall'],
  ];
  return (
    <details class="search-help">
      <summary>{t('browse.searchSyntax')}</summary>
      <table class="mini-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>
                <code>{k}</code>
              </td>
              <td>{t(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
