import { useEffect, useRef, useState } from 'preact/hooks';
import { newCard } from '../core/format.js';
import { sanitizeStyle } from '../core/style.js';
import { parseDelimited, rowsToCards } from '../io/csv.js';
import { Dialog, Empty, Icon, TagsInput } from './components.jsx';
import { go, href, useApp, useAsync } from './ctx.js';
import { errorText, t, tn } from './i18n.js';
import { CardEditor } from './card-editor.jsx';
import { LANGS } from './languages.js';
import { AppearanceSection, Swatches } from './style-panel.jsx';

// ------------------------------------------------------------------ page

export function Editor({ setId, focusCardId = null }) {
  const { lib, toast, settings, version } = useApp();
  const setRef = useRef(null);
  const [, bump] = useState(0);
  const [status, setStatus] = useState('saved');
  const [error, setError] = useState(null);
  const [focusId, setFocusId] = useState(focusCardId);
  const [bulk, setBulk] = useState(false);
  const timer = useRef();
  const dirty = useRef(false);
  const flushRef = useRef(() => {});
  const { data: setList } = useAsync(() => lib.listSets(), [lib, version]);

  useEffect(() => {
    let live = true;
    lib
      .loadSet(setId)
      .then((s) => {
        if (!live) return;
        if (!s) setError(new Error(t('common.setNotFound')));
        else {
          setRef.current = s;
          bump((n) => n + 1);
        }
      })
      .catch(setError);
    const flush = async () => {
      if (!dirty.current || !setRef.current) return;
      dirty.current = false;
      clearTimeout(timer.current);
      try {
        await lib.saveSet(setRef.current);
        setStatus('saved');
      } catch (e) {
        setStatus('error');
        console.error(e);
      }
    };
    flushRef.current = flush;
    addEventListener('pagehide', flush);
    return () => {
      live = false;
      removeEventListener('pagehide', flush);
      flush();
    };
  }, [lib, setId]);

  const touch = () => {
    dirty.current = true;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 700);
    bump((n) => n + 1);
  };
  const set = setRef.current;
  const folders = new Set();
  for (const folder of [...(setList?.sets.map((s) => s.folder) || []), set?.folder || '']) {
    const parts = folder.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  if (error)
    return (
      <Empty title={t('common.setNotFound')}>
        <p>{errorText(error)}</p>
        <a class="btn" href={href('')}>
          {t('common.backLibrary')}
        </a>
      </Empty>
    );
  if (!set) return <p class="muted pad">{t('common.loading')}</p>;

  const mutateSet = (patch) => {
    Object.assign(set, patch);
    touch();
  };
  const updateCard = (i, patch) => {
    set.cards[i] = { ...set.cards[i], ...patch };
    touch();
  };
  const addCard = (partial = {}, at = set.cards.length) => {
    const c = newCard(partial);
    set.cards.splice(at, 0, c);
    setFocusId(c.id);
    touch();
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= set.cards.length) return;
    [set.cards[i], set.cards[j]] = [set.cards[j], set.cards[i]];
    touch();
  };
  const remove = (i) => {
    const [gone] = set.cards.splice(i, 1);
    set.deleted = { ...set.deleted, [gone.id]: new Date().toISOString() }; // propagé par la synchronisation
    touch();
    toast(t('editor.cardDeleted'), '', {
      label: t('common.cancel'),
      run: () => {
        set.cards.splice(i, 0, { ...gone, restoredAt: new Date().toISOString() });
        delete set.deleted[gone.id];
        touch();
      },
    });
  };
  const ownStyle = set.cards.filter((c) => Object.keys(sanitizeStyle(c.style)).length).length;
  const resetCardStyles = () => {
    set.cards = set.cards.map((c) => (Object.keys(sanitizeStyle(c.style)).length ? { ...c, style: {} } : c));
    touch();
  };
  const duplicate = (i) =>
    addCard({ ...set.cards[i], id: undefined, style: { ...set.cards[i].style }, tags: [...set.cards[i].tags] }, i + 1);

  return (
    <div
      class="editor"
      onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && (e.preventDefault(), addCard())}
    >
      <header class="ed-head">
        <a class="back" href={href(`set/${set.id}`)}>
          <Icon name="back" />
          <span>{t('editor.finish')}</span>
        </a>
        <h1>
          {t('common.editSet')}
          {set.inactive && (
            <>
              {' '}
              <span class="badge inactive">
                <Icon name="pause" size={12} /> {t('common.inactive')}
              </span>
            </>
          )}
        </h1>
        <span class={'save-state ' + status} role="status">
          {status === 'saving' ? t('editor.saving') : status === 'error' ? t('editor.saveFailed') : t('editor.saved')}
        </span>
      </header>

      <section class="panel ed-meta">
        <label class="field big">
          <span>{t('editor.title')}</span>
          <input value={set.title} onInput={(e) => mutateSet({ title: e.currentTarget.value })} />
        </label>
        <label class="field">
          <span>{t('editor.description')}</span>
          <textarea
            rows="2"
            value={set.description}
            onInput={(e) => mutateSet({ description: e.currentTarget.value })}
          />
        </label>
        <div class="grid-3">
          <label class="field">
            <span>{t('editor.folder')}</span>
            <input
              value={set.folder}
              list="folder-options"
              placeholder={t('editor.folderPlaceholder')}
              onInput={(e) => mutateSet({ folder: e.currentTarget.value })}
              onBlur={(e) => {
                const folder = e.currentTarget.value
                  .trim()
                  .replace(/^\/+|\/+$/g, '')
                  .trim();
                if (folder !== set.folder) mutateSet({ folder });
              }}
            />
            <datalist id="folder-options">
              {[...folders]
                .sort((a, b) => a.localeCompare(b))
                .map((folder) => (
                  <option key={folder} value={folder} />
                ))}
            </datalist>
          </label>
          <label class="field">
            <span>{t('editor.termLanguage')}</span>
            <select
              value={set.language.term || ''}
              onChange={(e) => mutateSet({ language: { ...set.language, term: e.currentTarget.value || null } })}
            >
              {LANGS.map(([c, n]) => (
                <option key={c} value={c}>
                  {t(n)}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>{t('editor.definitionLanguage')}</span>
            <select
              value={set.language.definition || ''}
              onChange={(e) => mutateSet({ language: { ...set.language, definition: e.currentTarget.value || null } })}
            >
              {LANGS.map(([c, n]) => (
                <option key={c} value={c}>
                  {t(n)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label class="field">
          <span>{t('editor.tagsSeparatedSpaces')}</span>
          <TagsInput tags={set.tags} onChange={(tags) => mutateSet({ tags })} />
        </label>
        <div class="row">
          <span class="lbl">{t('editor.tabColor')}</span>
          <Swatches
            value={set.color || undefined}
            onChange={(v) => mutateSet({ color: v || null })}
            label={t('editor.tabColor')}
          />
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={!!set.inactive}
            onChange={(e) => mutateSet({ inactive: e.currentTarget.checked })}
          />
          <span>{t('editor.inactiveSet')}</span>
        </label>
        <AppearanceSection
          level="set"
          style={set.style}
          base={settings.cardStyle}
          onChange={(st) => mutateSet({ style: st })}
        >
          {/* une carte qui a sa propre apparence ne suit pas celle du jeu : on le dit, et on propose de l'effacer */}
          {ownStyle > 0 && (
            <p class="notice small own-style">
              {tn('appearance.cardsOwnStyle', ownStyle)}{' '}
              <button type="button" class="btn small" onClick={resetCardStyles}>
                <Icon name="undo" /> {t('appearance.resetCardsToSet')}
              </button>
            </p>
          )}
        </AppearanceSection>
      </section>

      <section aria-labelledby="ed-cards">
        <div class="ed-bar">
          <h2 id="ed-cards">{tn('common.nCards', set.cards.length)}</h2>
          <div class="actions">
            <button class="btn" onClick={() => setBulk(true)}>
              <Icon name="upload" /> {t('editor.pasteSeveralCards')}
            </button>
            <button class="btn primary" onClick={() => addCard()}>
              <Icon name="plus" /> {t('editor.addCard')} <kbd>Ctrl ↵</kbd>
            </button>
          </div>
        </div>
        {set.cards.length === 0 ? (
          <Empty title={t('common.noCards')}>
            <p>{t('editor.addFirstCardPaste')}</p>
          </Empty>
        ) : (
          <ol class="ed-list">
            {set.cards.map((c, i) => (
              <CardEditor
                key={c.id}
                card={c}
                index={i}
                total={set.cards.length}
                set={set}
                baseStyle={settings.cardStyle}
                autofocus={focusId === c.id}
                update={(p) => updateCard(i, p)}
                move={(d) => move(i, d)}
                remove={() => remove(i)}
                duplicate={() => duplicate(i)}
              />
            ))}
          </ol>
        )}
        {set.cards.length > 0 && (
          <div class="actions end">
            <button class="btn primary" onClick={() => addCard()}>
              <Icon name="plus" /> {t('editor.addCard')}
            </button>
            <button class="btn" onClick={() => go(`set/${set.id}`)}>
              {t('editor.finish')}
            </button>
          </div>
        )}
      </section>

      {bulk && (
        <BulkDialog
          onClose={() => setBulk(false)}
          onAdd={(cards) => {
            set.cards.push(...cards);
            touch();
            setBulk(false);
            toast(tn('editor.cardsAdded', cards.length));
          }}
        />
      )}
    </div>
  );
}

function BulkDialog({ onClose, onAdd }) {
  const [text, setText] = useState('');
  const [delim, setDelim] = useState('auto');
  const [custom, setCustom] = useState('');
  const delimiter = delim === 'auto' ? null : delim === 'tab' ? '\t' : delim === 'custom' ? custom || null : delim;
  let cards = [];
  try {
    cards = rowsToCards(parseDelimited(text, { delimiter }));
  } catch {
    /* aperçu vide */
  }
  return (
    <Dialog
      title={t('editor.pasteSeveralCards')}
      onClose={onClose}
      wide
      footer={
        <>
          <button class="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button class="btn primary" disabled={!cards.length} onClick={() => onAdd(cards)}>
            {cards.length ? tn('editor.addCards', cards.length) : t('editor.add')}
          </button>
        </>
      }
    >
      <p class="muted">{t('editor.oneCardPerLine')}</p>
      <textarea
        class="bulk"
        rows="9"
        value={text}
        placeholder={'la mesa\tla table\nla silla\tla chaise'}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <div class="grid-2">
        <label class="field-inline">
          <span>{t('editor.separator')}</span>
          <select value={delim} onChange={(e) => setDelim(e.currentTarget.value)}>
            <option value="auto">{t('common.detect')}</option>
            <option value="tab">{t('common.tab')}</option>
            <option value=",">{t('common.comma')}</option>
            <option value=";">{t('common.semicolon')}</option>
            <option value=" - ">{t('common.dashSurroundedSpaces')}</option>
            <option value=" :: ">::</option>
            <option value="custom">{t('editor.other')}</option>
          </select>
        </label>
        {delim === 'custom' && (
          <input
            aria-label={t('editor.customSeparator')}
            value={custom}
            onInput={(e) => setCustom(e.currentTarget.value)}
          />
        )}
      </div>
      {cards.length > 0 && (
        <p class="muted">
          {t('editor.preview', { a: cards[0].term.slice(0, 40), b: cards[0].definition.slice(0, 40) })}
        </p>
      )}
    </Dialog>
  );
}
