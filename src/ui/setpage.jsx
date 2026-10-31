import { useEffect, useMemo, useState } from 'preact/hooks';
import { todayMore, todayQueue } from '../core/daily.js';
import { Scheduler, defaultBoost } from '../core/srs.js';
import { computeStats, examPlan } from '../core/stats.js';
import { toggleStar, isSuspended, setSuspended } from '../core/progress.js';
import { expandSet, activeItems } from '../core/items.js';
import { exportApkg } from '../io/apkg-export.js';
import { exportDelimited, exportQuizletText } from '../io/csv.js';
import { exportMarkdown } from '../io/markdown.js';
import { Dialog, Empty, Icon, MediaImage, Md, downloadBlob, fileDate, fileSlug, shareFile } from './components.jsx';
import { go, href, useApp } from './ctx.js';
import { errorText, locale, percent, t, tn } from './i18n.js';
import { useSetData } from './useSet.js';

export const MODES = [
  { id: 'review', label: 'mode.review', desc: 'mode.reviewDesc', primary: true },
  { id: 'flashcards', label: 'mode.flashcards', desc: 'mode.flashcardsDesc' },
  { id: 'learn', label: 'mode.learn', desc: 'mode.learnDesc' },
  { id: 'write', label: 'mode.write', desc: 'mode.writeDesc' },
  { id: 'spell', label: 'mode.spell', desc: 'mode.spellDesc' },
  { id: 'test', label: 'mode.test', desc: 'mode.testDesc' },
  { id: 'match', label: 'mode.match', desc: 'mode.matchDesc' },
  { id: 'gravity', label: 'mode.gravity', desc: 'mode.gravityDesc' },
];

export function SetPage({ setId }) {
  const { lib, settings, toast } = useApp();
  const { loading, set, progress, error, update } = useSetData(setId);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scheduler = useMemo(() => new Scheduler({ retention: settings.retention }), [settings.retention]);

  if (loading) return <p class="muted pad">{t('common.loading')}</p>;
  if (error || !set) {
    return (
      <Empty title={t('common.setNotFound')}>
        <p>{error && errorText(error)}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  }

  const items = activeItems(expandSet(set, 'term'), progress);
  const stats = computeStats(items, progress, scheduler);
  const plan = examPlan(items, progress, progress.exam?.date); // panneau « Examen »
  const queue = todayQueue(items, progress, settings);
  const due = queue.counts.learning + queue.counts.review + queue.counts.new;
  const more = due > 0 ? null : todayMore(items, progress, settings);

  const setExam = (date) =>
    update((p) => {
      p.exam = date ? { date } : null;
    });
  const star = (cardId) => update((p) => toggleStar(p, cardId));
  const suspend = (cardId) => update((p) => setSuspended(p, cardId, !isSuspended(p, cardId)));

  return (
    <article class="setpage">
      <header class="set-head" style={set.color ? { '--tab': set.color } : undefined}>
        <div class="set-title">
          <p class="crumbs">
            <a href={href('')}>{t('common.library')}</a>
            {set.folder ? ` / ${set.folder.replaceAll('/', ' / ')}` : ''}
          </p>
          <h1>{set.title}</h1>
          {set.description && <p class="desc">{set.description}</p>}
          <p class="meta">
            {tn('common.nCards', set.cards.length)}
            {set.tags.length > 0 && ` — ${set.tags.join(', ')}`}
          </p>
        </div>
        <div class="set-actions">
          <a class="btn" href={href(`set/${set.id}/edit`)}>
            <Icon name="edit" /> {t('common.edit')}
          </a>
          <button class="btn" onClick={() => setShareOpen(true)}>
            <Icon name="share" /> {t('set.share')}
          </button>
          <button class="btn" onClick={() => setExportOpen(true)}>
            <Icon name="download" /> {t('set.export')}
          </button>
          <a class="btn" href={href(`set/${set.id}/print`)}>
            <Icon name="print" /> {t('set.print')}
          </a>
          <button class="btn bad-outline" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" /> {t('set.delete')}
          </button>
        </div>
      </header>

      {set.cards.length === 0 ? (
        <Empty title={t('set.setEmpty')}>
          <p>{t('set.addCardsHandPaste')}</p>
          <p>
            <a class="btn primary" href={href(`set/${set.id}/edit`)}>
              {t('set.addCards')}
            </a>
          </p>
        </Empty>
      ) : (
        <>
          <section class="today" aria-label={t('stats.period.today')}>
            <div class="today-main">
              <p class="big">{due > 0 ? tn('set.cardsToday', due) : t('set.allCaughtToday')}</p>
              <p class="muted">
                {due > 0 || !more || more.newLeft + more.reviewsLeft === 0
                  ? t('set.newLearningReview', {
                      a: queue.counts.new,
                      b: queue.counts.learning,
                      c: queue.counts.review,
                    })
                  : t('set.dailyLimitReachedNew', { a: more.newLeft, c: more.reviewsLeft })}
              </p>
            </div>
            {due > 0 ? (
              <a class="btn primary" href={href(`set/${set.id}/study/review`)}>
                {t('set.review')}
              </a>
            ) : more && defaultBoost(more) ? (
              <a class="btn" href={href(`set/${set.id}/study/review/more`)}>
                {t('set.studyAnyway')}
              </a>
            ) : null}
          </section>

          <section aria-labelledby="modes-h">
            <h2 id="modes-h">{t('set.study')}</h2>
            <ul class="modes">
              {MODES.filter((m) => !m.primary).map((m) => (
                <li key={m.id}>
                  <a class="mode" href={href(`set/${set.id}/study/${m.id}`)}>
                    <strong>{t(m.label)}</strong>
                    <span>{t(m.desc)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section class="grid2">
            <div class="panel">
              <div class="section-head">
                <h2>{t('common.progress')}</h2>
                <a class="btn small" href={href(`stats/${set.id}`)}>
                  {t('set.detailedStatistics')}
                </a>
              </div>
              <dl class="kv">
                <div>
                  <dt>{t('set.memoryScore')}</dt>
                  <dd>{percent(Math.round(stats.memoryScore * 100))}</dd>
                </div>
                <div>
                  <dt>{t('set.views')}</dt>
                  <dd>
                    {stats.seen} / {stats.total}
                  </dd>
                </div>
                <div>
                  <dt>{t('set.wellAnchored')}</dt>
                  <dd>{stats.mastered}</dd>
                </div>
                <div>
                  <dt>{t('common.streak')}</dt>
                  <dd>{tn('common.days', stats.streak)}</dd>
                </div>
              </dl>
              <h3>{t('set.upcomingReviews14Days')}</h3>
              <Forecast data={stats.forecast} />
              <h3>{t('set.activity')}</h3>
              <Heatmap data={stats.heat} />
            </div>
            <div class="panel">
              <h2>{t('set.exam')}</h2>
              <label class="field">
                <span>{t('set.examDate')}</span>
                <input
                  type="date"
                  value={progress.exam?.date || ''}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setExam(e.currentTarget.value)}
                />
              </label>
              {plan && !plan.passed && (
                <p>{t('set.daysNeverSeenItems', { d: plan.daysLeft, u: plan.unlearned, p: plan.perDay })}</p>
              )}
              {plan?.passed && <p class="muted">{t('set.datePassed')}</p>}
              {!plan && <p class="muted">{t('set.setDateSpacedRepetition')}</p>}
            </div>
          </section>

          <section aria-labelledby="cards-h">
            <div class="section-head">
              <h2 id="cards-h">{t('common.cards')}</h2>
              <a class="btn small" href={href('browse/' + encodeURIComponent(`set:"${set.title.replace(/"/g, '*')}"`))}>
                {t('set.searchSet')}
              </a>
            </div>
            <ul class="card-list">
              {set.cards.map((c) => (
                <li key={c.id} class={isSuspended(progress, c.id) ? 'suspended' : undefined}>
                  <div class="card-tools">
                    <button
                      class={'icon-btn star' + (progress.starred[c.id] ? ' on' : '')}
                      aria-pressed={!!progress.starred[c.id]}
                      aria-label={t('common.star')}
                      onClick={() => star(c.id)}
                    >
                      <Icon name="star" fill={!!progress.starred[c.id]} />
                    </button>
                    <button
                      class={'icon-btn' + (isSuspended(progress, c.id) ? ' on' : '')}
                      aria-pressed={isSuspended(progress, c.id)}
                      aria-label={t('common.suspend')}
                      title={t('common.suspendHint')}
                      onClick={() => suspend(c.id)}
                    >
                      <Icon name="pause" />
                    </button>
                  </div>
                  <div class="cell term">
                    {isSuspended(progress, c.id) && <span class="badge">{t('common.suspended')}</span>}
                    {c.type === 'occlusion' ? (
                      <div class="occ-thumb">
                        <MediaImage path={c.image} alt="" />
                        {c.term && <Md text={c.term} />}
                      </div>
                    ) : (
                      <Md text={c.term} extraMedia={[c.termImage || '']} />
                    )}
                  </div>
                  <div class="cell def">
                    {c.type === 'occlusion' ? (
                      <span class="muted">
                        {tn('set.masks', (c.masks || []).length)}
                        {c.definition && ' — '}
                        {c.definition && <Md text={c.definition} />}
                      </span>
                    ) : (
                      <Md text={c.definition} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {shareOpen && <ShareDialog set={set} onClose={() => setShareOpen(false)} />}
      {exportOpen && <ExportDialog set={set} progress={progress} onClose={() => setExportOpen(false)} />}
      {confirmDelete && (
        <Dialog
          title={t('set.deleteConfirm')}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button class="btn" onClick={() => setConfirmDelete(false)}>
                {t('common.cancel')}
              </button>
              <button
                class="btn bad"
                onClick={async () => {
                  await lib.deleteSet(set.id);
                  toast(t('set.setDeleted'));
                  go('');
                }}
              >
                {t('set.deletePermanently')}
              </button>
            </>
          }
        >
          <p>{t('set.deleteWarning', { title: set.title })}</p>
        </Dialog>
      )}
    </article>
  );
}

function ShareDialog({ set, onClose }) {
  const { lib, toast } = useApp();
  const [withProgress, setWithProgress] = useState(false);
  const [bytes, setBytes] = useState(null);
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  // Préparé à l'avance : navigator.share doit suivre de près le clic (activation utilisateur).
  useEffect(() => {
    let live = true;
    setBytes(null);
    lib.exportBundleBytes([set.id], { withProgress }).then(
      (b) => live && setBytes(b),
      (e) => toast(errorText(e), 'bad'),
    );
    return () => {
      live = false;
    };
  }, [lib, set.id, withProgress, toast]);
  const run = async () => {
    try {
      const r = await shareFile(`${fileSlug(set.title)}.flashcard.zip`, bytes, 'application/zip', {
        title: set.title,
        text: t('set.flashcardSetOpenFlashcard', { title: set.title }),
      });
      if (r === 'downloaded') toast(t('set.fileDownloadedSendAny'));
      if (r !== 'cancelled') onClose();
    } catch (e) {
      toast(errorText(e), 'bad');
    }
  };
  return (
    <Dialog
      title={t('set.shareTitle', { title: set.title })}
      onClose={onClose}
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn primary" disabled={!bytes} onClick={run}>
            <Icon name={canShare ? 'share' : 'download'} /> {canShare ? t('set.shareFile') : t('set.downloadFile')}
          </button>
        </>
      }
    >
      <p>{t('set.setSentFlashcardZip')}</p>
      <label class="check">
        <input type="checkbox" checked={withProgress} onChange={(e) => setWithProgress(e.currentTarget.checked)} />
        <span>{t('set.includeMyProgressMy')}</span>
      </label>
    </Dialog>
  );
}

function ExportDialog({ set, progress, onClose }) {
  const { lib, toast } = useApp();
  const [withProgress, setWithProgress] = useState(true);
  const [busy, setBusy] = useState(false);
  const slug = `${fileDate()}-${fileSlug(set.title)}`;
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      toast(errorText(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  const formats = [
    {
      id: 'flashcard',
      label: 'Flashcard (.flashcard.zip)',
      desc: t('set.nativeLosslessFormatCards'),
      fn: async () =>
        downloadBlob(
          `${slug}.flashcard.zip`,
          await lib.exportBundleBytes([set.id], { withProgress }),
          'application/zip',
        ),
    },
    {
      id: 'apkg',
      label: 'Anki (.apkg)',
      desc: t('set.cardsMediaAnkiProgress'),
      fn: async () =>
        downloadBlob(
          `${slug}.apkg`,
          await exportApkg([set], {
            getMedia: (p) => lib.readMedia(p),
            suspended: new Set(set.cards.filter((c) => isSuspended(progress, c.id)).map((c) => c.id)),
          }),
          'application/octet-stream',
        ),
    },
    {
      id: 'csv',
      label: 'CSV',
      desc: t('set.allColumnsOpensSpreadsheet'),
      fn: () => downloadBlob(`${slug}.csv`, exportDelimited(set), 'text/csv;charset=utf-8'),
    },
    {
      id: 'tsv',
      label: 'TSV',
      desc: t('set.sameThingTabs'),
      fn: () =>
        downloadBlob(
          `${slug}.tsv`,
          exportDelimited(set, { delimiter: '\t' }),
          'text/tab-separated-values;charset=utf-8',
        ),
    },
    {
      id: 'quizlet',
      label: t('set.quizletText'),
      desc: t('set.termDefinitionOneCard'),
      fn: () => downloadBlob(`${slug}.txt`, exportQuizletText(set), 'text/plain;charset=utf-8'),
    },
    { id: 'pdf', label: 'PDF', desc: t('set.cutCardsDoubleSided'), fn: () => go(`set/${set.id}/print`) },
    {
      id: 'md',
      label: 'Markdown',
      desc: t('set.readableEditableHandObsidian'),
      fn: () => downloadBlob(`${slug}.md`, exportMarkdown(set), 'text/markdown;charset=utf-8'),
    },
  ];
  return (
    <Dialog title={t('set.exportTitle', { title: set.title })} onClose={onClose} wide>
      <label class="check">
        <input type="checkbox" checked={withProgress} onChange={(e) => setWithProgress(e.currentTarget.checked)} />
        <span>{t('set.includeMyProgressFlashcard')}</span>
      </label>
      <ul class="export-list">
        {formats.map((f) => (
          <li key={f.id}>
            <button class="btn" disabled={busy} onClick={() => run(f.fn)}>
              {f.label}
            </button>
            <span class="muted">{f.desc}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function Forecast({ data }) {
  const max = Math.max(1, ...data);
  const w = 14 * 22;
  return (
    <svg
      class="forecast"
      viewBox={`0 0 ${w} 70`}
      role="img"
      aria-label={t('set.cardsDueNext14', { l: data.join(', ') })}
    >
      {data.map((n, i) => {
        const h = Math.round((n / max) * 52);
        return (
          <g key={i}>
            <rect
              x={i * 22 + 2}
              y={58 - h}
              width="18"
              height={Math.max(h, n ? 2 : 1)}
              rx="2"
              class={i === 0 ? 'bar-today' : 'bar-fut'}
            />
            {n > 0 && (
              <text x={i * 22 + 11} y={54 - h} text-anchor="middle" class="bar-n">
                {n}
              </text>
            )}
            <text x={i * 22 + 11} y="69" text-anchor="middle" class="bar-d">
              {i === 0 ? '0' : '+' + i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Heatmap({ data }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const level = (n) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((n / max) * 3.99)));
  const df = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' });
  return (
    <div class="heat" role="img" aria-label={t('set.activityOverLast18')}>
      {data.map((d) => (
        <span
          key={d.day}
          class={'cell l' + level(d.n)}
          title={`${df.format(new Date(d.day + 'T12:00:00'))} : ${d.n}`}
        />
      ))}
    </div>
  );
}
