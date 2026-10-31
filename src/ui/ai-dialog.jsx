// Dialogue « Créer avec l'IA » : par clé d'API, ou par copier-coller avec un assistant en ligne.
import { useRef, useState } from 'preact/hooks';
import {
  CHATBOTS,
  aiConfigured,
  chatPrompt,
  chatbotUrl,
  generateCards,
  loadAiConfig,
  parseChatReply,
} from '../ai/client.js';
import { pdfToText } from '../ai/pdf.js';
import { newCard, newSet } from '../core/format.js';
import { Dialog, Icon } from './components.jsx';
import { go, href, useApp } from './ctx.js';
import { errorText, t, tn } from './i18n.js';
import { LANGS } from './languages.js';

export function AiDialog({ onClose, onDone }) {
  const { lib, toast, settings } = useApp();
  const cfg = loadAiConfig();
  const ok = aiConfigured(cfg);
  // sans clé d'API : copier-coller avec un assistant en ligne (compte gratuit suffisant)
  const [mode, setMode] = useState(ok ? 'api' : 'chat');
  const [text, setText] = useState('');
  const [count, setCount] = useState(20);
  const [kind, setKind] = useState('mixed');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [languages, setLanguages] = useState(() => ({ ...settings.language }));
  // sans clé : fichiers joints directement dans l'assistant (il les lit lui-même : PDF scannés, images, Word…)
  const [attached, setAttached] = useState(false);
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [cards, setCards] = useState(null);
  const [picked, setPicked] = useState({});
  const fileInput = useRef();
  const attach = mode === 'chat' && attached;
  const request = { text, count, kind, languages, notes, attached: attach };
  const hasSource = attach || !!text.trim();

  const readFile = async (f) => {
    setErr('');
    setBusy(t('library.readingFile'));
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const content = /\.pdf$/i.test(f.name)
        ? await pdfToText(bytes, { workerSrc: './pdf.worker.min.mjs' })
        : new TextDecoder().decode(bytes);
      setText((x) => (x ? x + '\n\n' : '') + content);
      if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ''));
    } catch (e) {
      setErr(t('library.unableRead', { m: errorText(e) }));
    }
    setBusy('');
  };

  const show = (out) => {
    if (!out.length) throw new Error(t('library.noUsableCardsTry'));
    setCards(out);
    setPicked(Object.fromEntries(out.map((_, i) => [i, true])));
  };

  const run = async () => {
    setErr('');
    setBusy(t('library.generating'));
    try {
      show(await generateCards(request, cfg));
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy('');
  };

  // copie puis ouverture dans le même geste (sinon le navigateur bloque la nouvelle fenêtre)
  const copyPrompt = (bot) => {
    setErr('');
    const prompt = chatPrompt(request);
    navigator.clipboard?.writeText(prompt).then(
      () => setCopied(true),
      () => setErr(t('library.copyFailedSelectPrompt')),
    );
    // fichiers à joindre : pas de consigne dans l'adresse (certains assistants l'envoient aussitôt)
    if (bot) window.open(attach ? bot.url : chatbotUrl(bot, prompt), '_blank', 'noopener');
  };

  const readReply = () => {
    setErr('');
    try {
      show(parseChatReply(reply).slice(0, 200));
    } catch (e) {
      setErr(t('library.unreadableAnswerCopyAssistants', { m: errorText(e) }));
    }
  };

  const save = async () => {
    const chosen = cards.filter((_, i) => picked[i]).map((c) => newCard(c));
    const s = newSet({
      title: title || t('library.generatedCards'),
      language: { term: languages.term || null, definition: languages.definition || null },
      cards: chosen,
    });
    await lib.saveSet(s);
    toast(tn('library.cardsCreated', chosen.length));
    onDone();
    go(`set/${s.id}`);
  };

  const nPicked = cards ? Object.values(picked).filter(Boolean).length : 0;
  const footer = cards ? (
    <>
      <button class="btn" onClick={() => setCards(null)}>
        {t('common.back')}
      </button>
      <button class="btn primary" disabled={!nPicked} onClick={save}>
        {t('library.createSetCards', { n: nPicked })}
      </button>
    </>
  ) : mode === 'api' ? (
    <>
      <button class="btn" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button class="btn primary" disabled={!ok || !text.trim() || !!busy} onClick={run}>
        {busy || t('library.generate')}
      </button>
    </>
  ) : (
    <>
      <button class="btn" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button class="btn primary" disabled={!reply.trim()} onClick={readReply}>
        {t('library.readAnswer')}
      </button>
    </>
  );
  return (
    <Dialog title={t('library.createCardsAi')} onClose={onClose} wide footer={footer}>
      {!cards ? (
        <>
          <div class="tabs" role="tablist">
            {[
              ['chat', t('library.aiModeChat')],
              ['api', t('library.aiModeApi')],
            ].map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                class={'tab-btn' + (mode === k ? ' on' : '')}
                onClick={() => setMode(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <label class="field">
            <span>{t('library.setTitle')}</span>
            <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>
          {mode === 'chat' && (
            <label class="check attach-check">
              <input type="checkbox" checked={attached} onChange={(e) => setAttached(e.currentTarget.checked)} />
              <span>
                {t('library.aiAttachInAssistant')}
                <span class="muted small check-help">{t('library.aiAttachHelp')}</span>
              </span>
            </label>
          )}
          <label class="field">
            <span>{attach ? t('library.aiAttachComplement') : t('library.topicNotesTextLearn')}</span>
            <textarea
              class="bulk"
              rows={attach ? 3 : 7}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              placeholder={t('library.aiTopicPlaceholder')}
            />
          </label>
          {!attach && (
            <div class="actions">
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".txt,.md,.markdown,.pdf,text/plain"
                onChange={(e) => (readFile(e.currentTarget.files[0]), (e.currentTarget.value = ''))}
              />
              <button class="btn" onClick={() => fileInput.current.click()}>
                <Icon name="upload" /> {t('library.addFilePdfText')}
              </button>
            </div>
          )}
          <div class="grid-2">
            <label class="field">
              <span>{t('library.numberCards', { n: count })}</span>
              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={count}
                onInput={(e) => setCount(Number(e.currentTarget.value))}
              />
            </label>
            <label class="field">
              <span>{t('library.type')}</span>
              <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
                <option value="mixed">{t('library.mixed')}</option>
                <option value="basic">{t('common.cardTypeBasic')}</option>
                <option value="cloze">{t('common.cardTypeCloze')}</option>
              </select>
            </label>
          </div>
          <div class="grid-2">
            {[
              ['term', 'editor.termLanguage'],
              ['definition', 'editor.definitionLanguage'],
            ].map(([k, label]) => (
              <label key={k} class="field">
                <span>{t(label)}</span>
                <select
                  value={languages[k] || ''}
                  onChange={(e) => setLanguages({ ...languages, [k]: e.currentTarget.value || null })}
                >
                  {LANGS.map(([c, n]) => (
                    <option key={c} value={c}>
                      {t(n)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label class="field">
            <span>{t('library.aiNotes')}</span>
            <input
              value={notes}
              onInput={(e) => setNotes(e.currentTarget.value)}
              placeholder={t('library.aiNotesPlaceholder')}
            />
          </label>
          {mode === 'api' ? (
            <>
              {!ok && (
                <p class="notice">
                  {t('library.noAiProviderConfigured')}{' '}
                  <a href={href('settings')} onClick={onClose}>
                    {t('library.openSettings')}
                  </a>
                </p>
              )}
              <p class="muted small">{t('library.textSentProviderConfigured', { p: cfg.baseUrl || cfg.provider })}</p>
            </>
          ) : (
            <div class="chat-steps">
              <h3>{t('library.aiStep1')}</h3>
              <div class="actions">
                {CHATBOTS.map((b) => (
                  <button key={b.id} class="btn" disabled={!hasSource} onClick={() => copyPrompt(b)}>
                    {b.name} <Icon name="external" />
                  </button>
                ))}
                <button class="btn" disabled={!hasSource} onClick={() => copyPrompt(null)}>
                  {t('library.copyOnly')}
                </button>
              </div>
              {copied && (
                <p class="muted small" role="status">
                  {attach ? t('library.promptCopiedAttach') : t('library.promptCopiedPasteAssistant')}
                </p>
              )}
              <details>
                <summary class="muted small">{t('library.showPrompt')}</summary>
                <textarea
                  class="bulk"
                  rows="6"
                  readOnly
                  value={hasSource ? chatPrompt(request) : ''}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </details>
              <h3>{t('library.aiStep2')}</h3>
              <textarea
                class="bulk"
                rows="6"
                value={reply}
                onInput={(e) => setReply(e.currentTarget.value)}
                placeholder='[{"type":"basic","term":"…","definition":"…"}, …]'
                aria-label={t('library.assistantsAnswer')}
              />
              <p class="muted small">{t('library.noKeySignFlashcard')}</p>
            </div>
          )}
        </>
      ) : (
        <ul class="gen-list">
          {cards.map((c, i) => (
            <li key={i}>
              <label class="check">
                <input
                  type="checkbox"
                  checked={!!picked[i]}
                  onChange={(e) => setPicked({ ...picked, [i]: e.currentTarget.checked })}
                />
                <span>
                  <strong>{c.term}</strong>
                  {c.definition && <> — {c.definition}</>}{' '}
                  {c.type === 'cloze' && <em class="muted">({t('library.clozeMark')})</em>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {err && (
        <p class="notice bad" role="alert">
          {err}
        </p>
      )}
    </Dialog>
  );
}
