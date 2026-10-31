import { useMemo, useState } from 'preact/hooks';
import { newCard, newSet } from '../core/format.js';
import { expandSet } from '../core/items.js';
import { todayQueue } from '../core/daily.js';
import { Empty, Icon } from './components.jsx';
import { go, href, useApp, useAsync } from './ctx.js';
import { errorText, t, tn } from './i18n.js';
import { AiDialog } from './ai-dialog.jsx';
import { ImportDialog } from './import-dialog.jsx';

const NONE = []; // référence stable tant que rien n'est chargé

export function LibraryPage() {
  const { lib, version, settings } = useApp();
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null); // 'import' | 'ai'
  const { data, loading, error, reload } = useAsync(async () => {
    const { sets, errors } = await lib.listSets();
    // en parallèle : chaque jeu et sa progression, pour le nombre de cartes du jour
    const rows = await Promise.all(
      sets.map(async (s) => {
        const [full, p] = await Promise.all([lib.loadSet(s.id), lib.loadProgress(s.id)]);
        const c = todayQueue(expandSet(full, 'term'), p, settings).counts;
        return { ...s, due: c.learning + c.review + c.new };
      }),
    );
    return { rows, errors };
  }, [lib, version, settings]);

  const rows = data?.rows ?? NONE;
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter((r) => (r.title + ' ' + r.tags.join(' ') + ' ' + r.folder).toLowerCase().includes(n)) : rows;
  }, [rows, q]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const k = r.folder || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])));
  }, [filtered]);
  const totalDue = rows.reduce((n, r) => n + r.due, 0);
  const firstDue = rows.find((r) => r.due > 0);

  const create = async () => {
    const s = newSet({ title: t('library.newSet'), language: { ...settings.language }, cards: [newCard()] });
    await lib.saveSet(s);
    go(`set/${s.id}/edit`);
  };

  return (
    <div class="library">
      <header class="lib-head">
        <div>
          <h1>{t('common.library')}</h1>
          {rows.length > 0 && (
            <p class="muted">{totalDue > 0 ? tn('library.cardsDueToday', totalDue) : t('library.allCaughtToday')}</p>
          )}
        </div>
        <div class="actions">
          {firstDue && (
            <a class="btn primary" href={href(`set/${firstDue.id}/study/review`)}>
              {t('library.reviewSet', { t: firstDue.title })}
            </a>
          )}
          <button class="btn" onClick={() => setDialog('import')}>
            <Icon name="upload" /> {t('library.import')}
          </button>
          <button class="btn" onClick={() => setDialog('ai')}>
            <Icon name="spark" /> {t('library.createAi')}
          </button>
          <button class="btn primary-outline" onClick={create}>
            <Icon name="plus" /> {t('library.newSet')}
          </button>
        </div>
      </header>

      {error && (
        <p class="notice bad" role="alert">
          {errorText(error)}
        </p>
      )}
      {data?.errors?.length > 0 && (
        <p class="notice" role="alert">
          {tn('library.unreadableFilesSkipped', data.errors.length)}
          {data.errors.map((e) => e.file).join(', ')}
        </p>
      )}

      {rows.length > 0 && (
        <label class="search">
          <span class="sr-only">{t('library.searchSet')}</span>
          <input
            type="search"
            placeholder={t('library.searchTitleFolderTag')}
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </label>
      )}

      {loading && !data ? (
        <p class="muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <Empty title={t('library.libraryEmpty')}>
          <p>{t('library.createSetImportOne')}</p>
          <div class="actions center">
            <button class="btn primary" onClick={create}>
              {t('library.createSet')}
            </button>
            <button class="btn" onClick={() => setDialog('import')}>
              {t('library.import')}
            </button>
          </div>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty title={t('common.noResults')}>
          <p>{t('library.noSetMatches', { q })}</p>
        </Empty>
      ) : (
        groups.map(([folder, list]) => (
          <section key={folder} class="folder">
            {folder && (
              <h2>
                <Icon name="folder" /> {folder.replaceAll('/', ' / ')}
              </h2>
            )}
            <ul class="set-list">
              {list.map((r) => (
                <li key={r.id} style={r.color ? { '--tab': r.color } : undefined}>
                  <a class="set-row" href={href(`set/${r.id}`)}>
                    <span class="tab" aria-hidden="true" />
                    <span class="title">{r.title}</span>
                    <span class="muted count">{tn('common.nCards', r.count)}</span>
                    {r.tags.length > 0 && <span class="muted tags">{r.tags.join(', ')}</span>}
                    {r.due > 0 && (
                      <span class="pill due" title={t('library.dueToday')}>
                        {r.due}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {dialog === 'import' && (
        <ImportDialog onClose={() => setDialog(null)} onDone={() => (setDialog(null), reload())} />
      )}
      {dialog === 'ai' && <AiDialog onClose={() => setDialog(null)} onDone={() => (setDialog(null), reload())} />}
    </div>
  );
}
