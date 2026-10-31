// Édition d'une carte (terme / définition, texte à trous, image masquée).
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseCloze } from '../core/text.js';
import { sanitizeStyle } from '../core/style.js';
import { Icon, IndexCard, Md } from './components.jsx';
import { t, tn } from './i18n.js';
import { OcclusionEditor } from './occlusion.jsx';
import { MediaField } from './media-field.jsx';
import { StylePanel } from './style-panel.jsx';

// ------------------------------------------------------------------ carte

function wrapCloze(ta, card, same) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  if (a === b) return null;
  const nums = parseCloze(value).map((c) => c.n);
  const n = same && nums.length ? nums[nums.length - 1] : (nums.length ? Math.max(...nums) : 0) + 1;
  return value.slice(0, a) + `{{c${n}::${value.slice(a, b)}}}` + value.slice(b);
}

export function CardEditor({ card, index, total, set, update, move, remove, duplicate, autofocus }) {
  const termRef = useRef();
  const [open, setOpen] = useState(false); // détails : indice, exemple, médias
  const [styleOpen, setStyleOpen] = useState(false);
  useEffect(() => {
    if (autofocus) termRef.current?.focus();
  }, [autofocus]);
  const cloze = card.type === 'cloze';
  const occ = card.type === 'occlusion';
  const makeCloze = (same) => {
    const out = wrapCloze(termRef.current, card, same);
    if (out !== null) update({ term: out });
  };
  const nClozes = cloze ? parseCloze(card.term).length : 0;
  const eff = { ...sanitizeStyle(set.style), ...sanitizeStyle(card.style) };

  return (
    <li class="ed-card" data-card={card.id}>
      <div class="ed-card-head">
        <span class="qnum">{index + 1}</span>
        <div class="seg" role="group" aria-label={t('editor.cardType')}>
          <button
            type="button"
            class={'seg-opt' + (card.type === 'basic' ? ' on' : '')}
            aria-pressed={card.type === 'basic'}
            onClick={() => update({ type: 'basic' })}
          >
            {t('common.cardTypeBasic')}
          </button>
          <button
            type="button"
            class={'seg-opt' + (cloze ? ' on' : '')}
            aria-pressed={cloze}
            onClick={() => update({ type: 'cloze' })}
          >
            {t('common.cardTypeCloze')}
          </button>
          <button
            type="button"
            class={'seg-opt' + (occ ? ' on' : '')}
            aria-pressed={occ}
            onClick={() => update({ type: 'occlusion', masks: card.masks || [], occlusion: card.occlusion || 'all' })}
          >
            {t('common.cardTypeOcclusion')}
          </button>
        </div>
        <span class="spacer" />
        <button
          type="button"
          class="icon-btn"
          aria-label={t('editor.moveUp')}
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <Icon name="up" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={t('editor.moveDown')}
          disabled={index === total - 1}
          onClick={() => move(1)}
        >
          <Icon name="down" />
        </button>
        <button type="button" class="icon-btn" aria-label={t('editor.duplicate')} onClick={duplicate}>
          <Icon name="copy" />
        </button>
        <button type="button" class="icon-btn danger" aria-label={t('editor.deleteCard')} onClick={remove}>
          <Icon name="trash" />
        </button>
      </div>
      {occ && (
        <div class="ed-occ">
          <MediaField
            kind="image"
            label={t('editor.imageMask')}
            value={card.image}
            onChange={(v) => update({ image: v })}
          />
          <OcclusionEditor
            image={card.image}
            masks={card.masks || []}
            mode={card.occlusion || 'all'}
            onChange={(m) => update({ masks: m })}
            onMode={(v) => update({ occlusion: v })}
          />
          <div class="ed-fields">
            <label class="field">
              <span>{t('editor.titleShownAboveImage')}</span>
              <textarea
                ref={termRef}
                rows="1"
                value={card.term}
                onInput={(e) => update({ term: e.currentTarget.value })}
              />
            </label>
            <label class="field">
              <span>{t('editor.extraShownAnswerOptional')}</span>
              <textarea
                rows="1"
                value={card.definition}
                onInput={(e) => update({ definition: e.currentTarget.value })}
              />
            </label>
          </div>
        </div>
      )}
      {!occ && (
        <div class="ed-fields">
          <label class="field">
            <span>{cloze ? t('editor.textSelectWordMake') : t('browse.sort.term')}</span>
            <textarea
              ref={termRef}
              rows={cloze ? 3 : 2}
              value={card.term}
              onInput={(e) => update({ term: e.currentTarget.value })}
              spellcheck={true}
            />
          </label>
          <label class="field">
            <span>{cloze ? t('editor.extraShownAnswerOptional') : t('browse.sort.def')}</span>
            <textarea
              rows={cloze ? 2 : 2}
              value={card.definition}
              onInput={(e) => update({ definition: e.currentTarget.value })}
            />
          </label>
        </div>
      )}
      {cloze && (
        <div class="cloze-tools">
          <button type="button" class="btn small" onClick={() => makeCloze(false)}>
            {t('editor.makeBlank')}
          </button>
          <button type="button" class="btn small" onClick={() => makeCloze(true)}>
            {t('editor.sameBlankPreviousOne')}
          </button>
          <span class="muted">{nClozes > 0 ? tn('editor.blanksStudyCards', nClozes) : t('editor.noBlanksYet')}</span>
        </div>
      )}
      <div class="ed-toggles">
        <button type="button" class="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {occ ? t('editor.hintAudioTags') : t('editor.hintExampleImagesAudio')}
          {(card.hint || card.example || (!occ && card.image) || card.termImage || card.audio) && ' •'}
        </button>
        <button type="button" class="link-btn" aria-expanded={styleOpen} onClick={() => setStyleOpen(!styleOpen)}>
          {t('editor.appearance')}
          {Object.keys(sanitizeStyle(card.style)).length > 0 && ' •'}
        </button>
      </div>
      {open && (
        <div class="ed-more">
          <div class="grid-2">
            <label class="field">
              <span>{t('editor.hint')}</span>
              <input value={card.hint} onInput={(e) => update({ hint: e.currentTarget.value })} />
            </label>
            <label class="field">
              <span>{t('editor.example')}</span>
              <input value={card.example} onInput={(e) => update({ example: e.currentTarget.value })} />
            </label>
          </div>
          <div class="grid-2">
            {card.type === 'basic' && (
              <MediaField
                kind="image"
                label={t('editor.termImage')}
                value={card.termImage}
                onChange={(v) => update({ termImage: v })}
              />
            )}
            {!occ && (
              <MediaField
                kind="image"
                label={cloze ? t('editor.image') : t('editor.definitionImage')}
                value={card.image}
                onChange={(v) => update({ image: v })}
              />
            )}
            <MediaField
              kind="audio"
              label={t('editor.audioPronunciation')}
              value={card.audio}
              onChange={(v) => update({ audio: v })}
            />
          </div>
          <label class="field">
            <span>{t('editor.tagsSeparatedSpaces')}</span>
            <input
              value={card.tags.join(' ')}
              onInput={(e) => update({ tags: e.currentTarget.value.split(/\s+/).filter(Boolean) })}
            />
          </label>
        </div>
      )}
      {styleOpen && (
        <StylePanel
          inherit
          style={card.style}
          onChange={(s) => update({ style: s })}
          preview={() => (
            <div class="mini-pair">
              <IndexCard class="mini" style={eff} side="prompt">
                <div class="face-content">
                  <Md
                    text={
                      cloze
                        ? card.term.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '[…]')
                        : card.term || t('browse.sort.term')
                    }
                  />
                </div>
              </IndexCard>
              <IndexCard class="mini" style={eff} side="answer">
                <div class="face-content">
                  <Md text={card.definition || t('browse.sort.def')} />
                </div>
              </IndexCard>
            </div>
          )}
        />
      )}
    </li>
  );
}
