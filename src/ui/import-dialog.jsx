// Dialogue « Importer » : fichiers (Anki, CSV, Markdown, archives…), texte collé, lien.
import { useMemo, useRef, useState } from 'preact/hooks';
import { copySet } from '../core/format.js';
import { parseImportFile, parsePastedText } from '../io/import-file.js';
import { Dialog } from './components.jsx';
import { go, useApp, useAsync } from './ctx.js';
import { errorText, t, tn } from './i18n.js';
import { shrinkImportedMedia } from './media.js';

export function ImportDialog({ onClose, onDone }) {
  const { lib, toast } = useApp();
  const [tab, setTab] = useState('file');
  const [pending, setPending] = useState([]); // résultats d'analyse
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInput = useRef();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [delim, setDelim] = useState('auto');
  const [rowDelim, setRowDelim] = useState('\n');
  const [url, setUrl] = useState('');
  const [drag, setDrag] = useState(false);
  // titre et sort de chaque jeu importé ; un jeu déjà présent est importé comme copie, sauf choix contraire
  const existing = useAsync(async () => new Map((await lib.listSets()).sets.map((s) => [s.id, s.title])), [lib]);
  const [choices, setChoices] = useState({});
  const choiceOf = (s) => {
    const exists = existing.data?.has(s.id);
    return {
      title: exists ? t('library.copyTitle', { title: s.title }) : s.title,
      mode: exists ? 'copy' : 'new',
      exists,
      ...choices[s.id],
    };
  };
  const choose = (s, patch) => setChoices((c) => ({ ...c, [s.id]: { ...choiceOf(s), ...patch } }));

  const addResult = (name, r) => setPending((p) => [...p, { name, ...r }]);

  const handleFiles = async (files) => {
    setErr('');
    setBusy(true);
    for (const f of files) {
      try {
        addResult(f.name, await parseImportFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }));
      } catch (e) {
        setErr(`${f.name} : ${errorText(e)}`);
      }
    }
    setBusy(false);
  };

  const fromUrl = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'import.txt');
      addResult(name, await parseImportFile({ name, bytes: new Uint8Array(await res.arrayBuffer()) }));
    } catch (e) {
      setErr(t('library.unableDownloadLinkSite', { m: errorText(e) }));
    }
    setBusy(false);
  };

  const parsed = useMemo(() => {
    if (tab !== 'paste' || !text.trim()) return null;
    const delimiter = delim === 'auto' ? null : delim === 'tab' ? '\t' : delim;
    return parsePastedText(text, {
      title: title || t('library.pastedImport'),
      delimiter,
      rowDelimiter: rowDelim === '\n' ? null : rowDelim,
    });
  }, [tab, text, title, delim, rowDelim]);

  const all = tab === 'paste' ? (parsed?.sets.length ? [{ name: 'paste', ...parsed }] : []) : pending;
  const nCards = all.reduce((n, r) => n + r.sets.reduce((m, s) => m + s.cards.length, 0), 0);

  const commit = async () => {
    setBusy(true);
    try {
      let n = 0;
      let last = null;
      for (const r of all) {
        // Images d'Anki allégées comme celles de l'éditeur ; une archive Mnemo est restaurée telle quelle.
        const shrunk = r.kind === 'anki' && r.media?.size ? await shrinkImportedMedia(r.sets, r.media) : r;
        // titres choisis ; copie : nouveaux identifiants, sans la progression de l'original
        const progress = { ...r.progress };
        const logs = { ...r.logs };
        const sets = shrunk.sets.map((s) => {
          const c = choiceOf(r.sets.find((o) => o.id === s.id) || s);
          if (!(c.exists && c.mode === 'copy')) return { ...s, title: c.title };
          delete progress[s.id];
          delete logs[s.id];
          return copySet(s, c.title);
        });
        const ids = await lib.addSets(sets, shrunk.media, { progress, logs });
        n += ids.length;
        last = ids[ids.length - 1];
      }
      toast(tn('library.setsImported', n));
      onDone();
      if (n === 1 && last) go(`set/${last}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('library.import')}
      onClose={onClose}
      wide
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn primary" disabled={!nCards || busy} onClick={commit}>
            {nCards ? t('library.importCards', { n: nCards }) : t('library.import')}
          </button>
        </>
      }
    >
      <div class="tabs" role="tablist">
        {[
          ['file', t('library.file')],
          ['paste', t('library.pastedText')],
          ['url', t('library.link')],
        ].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            class={'tab-btn' + (tab === k ? ' on' : '')}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'file' && (
        <div
          class={'drop' + (drag ? ' over' : '')}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), handleFiles([...e.dataTransfer.files]))}
        >
          <p>{t('library.dropFilesHere')}</p>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".apkg,.colpkg,.zip,.csv,.tsv,.txt,.md,.markdown,.json"
            onChange={(e) => (handleFiles([...e.currentTarget.files]), (e.currentTarget.value = ''))}
          />
          <button class="btn" onClick={() => fileInput.current.click()}>
            {t('library.chooseFiles')}
          </button>
          <p class="muted small">{t('library.ankiApkgFlashcardArchive')}</p>
        </div>
      )}

      {tab === 'paste' && (
        <div>
          <details class="help">
            <summary>{t('library.howIExportQuizlet')}</summary>
            <p>{t('library.openSetQuizletMenu')}</p>
          </details>
          <label class="field">
            <span>{t('library.setTitle')}</span>
            <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>
          <textarea
            class="bulk"
            rows="8"
            value={text}
            placeholder={'terme\tdéfinition'}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <div class="grid-2">
            <label class="field-inline">
              <span>{t('library.betweenTermDefinition')}</span>
              <select value={delim} onChange={(e) => setDelim(e.currentTarget.value)}>
                <option value="auto">{t('common.detect')}</option>
                <option value="tab">{t('common.tab')}</option>
                <option value=",">{t('common.comma')}</option>
                <option value=";">{t('common.semicolon')}</option>
                <option value=" - ">{t('common.dashSurroundedSpaces')}</option>
                <option value=" :: ">::</option>
              </select>
            </label>
            <label class="field-inline">
              <span>{t('library.betweenCards')}</span>
              <select value={rowDelim} onChange={(e) => setRowDelim(e.currentTarget.value)}>
                <option value={'\n'}>{t('library.lineBreak')}</option>
                <option value=";;">;;</option>
                <option value={'\n\n'}>{t('library.blankLine')}</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {tab === 'url' && (
        <form onSubmit={(e) => (e.preventDefault(), fromUrl())}>
          <label class="field">
            <span>{t('library.fileAddress')}</span>
            <input
              type="url"
              placeholder="https://…/jeu.flashcard.zip"
              value={url}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
          </label>
          <button class="btn" disabled={!url || busy} type="submit">
            {t('library.download')}
          </button>
          <p class="muted small">{t('library.publicQuizletSetsCant')}</p>
        </form>
      )}

      {err && (
        <p class="notice bad" role="alert">
          {err}
        </p>
      )}
      {all.length > 0 && (
        <ul class="import-preview">
          {all.map((r, i) => (
            <li key={i}>
              <strong>{r.name === 'paste' ? t('library.pastedText') : r.name}</strong>
              {r.sets.map((s) => {
                const c = choiceOf(s);
                return (
                  <div key={s.id} class="import-set">
                    <input
                      value={c.title}
                      aria-label={t('library.setTitle')}
                      onInput={(e) => choose(s, { title: e.currentTarget.value })}
                    />
                    <span class="muted">{tn('common.nCards', s.cards.length)}</span>
                    {c.exists && (
                      <select
                        value={c.mode}
                        aria-label={t('library.importExists')}
                        onChange={(e) => {
                          const mode = e.currentTarget.value;
                          choose(s, {
                            mode,
                            title:
                              mode === 'update' ? existing.data.get(s.id) : t('library.copyTitle', { title: s.title }),
                          });
                        }}
                      >
                        <option value="copy">{t('library.importAsCopy')}</option>
                        <option value="update">{t('library.importUpdate')}</option>
                      </select>
                    )}
                  </div>
                );
              })}
              {r.media?.size > 0 && <span class="muted">{tn('library.mediaFiles', r.media.size)}</span>}
              {r.warnings?.slice(0, 3).map((w, j) => (
                <em key={j} class="warn">
                  {errorText(w)}
                </em>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
