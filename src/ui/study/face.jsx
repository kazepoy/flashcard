import { AudioButton, MediaImage, Md } from '../components.jsx';
import { t } from '../i18n.js';
import { OcclusionView } from '../occlusion.jsx';

/** Langue de synthèse vocale d'une face. */
export function langOf(set, item, side) {
  const { term, definition } = set.language || {};
  const promptIsTerm = !item.reversed;
  if (item.kind === 'cloze') return side === 'prompt' ? term : term;
  return (side === 'prompt') === promptIsTerm ? term : definition;
}

/** Une face de carte ; `recall` : au verso, rappelle la question au-dessus de la réponse (fiches retournées). */
export function CardFace({ item, set, side, showHint = false, recall = false }) {
  if (item.kind === 'occlusion') {
    return (
      <div class="face-content occ-face">
        {item.prompt && <Md text={item.prompt} />}
        <OcclusionView occ={item.occlusion} side={side} />
        {side === 'answer' && item.answer && (
          <p class="occ-answer">
            <strong>{item.answer}</strong>
          </p>
        )}
        {side === 'answer' && item.extra && <Md class="extra" text={item.extra} />}
        {showHint && side === 'prompt' && item.hint && <p class="hint">{item.hint}</p>}
        {side === 'answer' && item.answerAudio && (
          <div class="face-tools">
            <AudioButton path={item.answerAudio} text="" />
          </div>
        )}
      </div>
    );
  }
  if (side === 'prompt') {
    return (
      <div class="face-content">
        <Md text={item.prompt} />
        <MediaImage path={item.promptImage} />
        {showHint && item.hint && <p class="hint">{item.hint}</p>}
        <div class="face-tools">
          <AudioButton
            path={item.promptAudio}
            text={item.promptAudio ? '' : item.prompt}
            lang={langOf(set, item, 'prompt')}
          />
        </div>
      </div>
    );
  }
  return (
    <div class="face-content">
      {/* rappel de la question (sauf texte à trous : la phrase révélée la contient déjà) */}
      {recall && item.kind === 'basic' && (
        <div class="face-recall">
          <Md text={item.prompt} />
          <MediaImage path={item.promptImage} />
        </div>
      )}
      <Md text={item.kind === 'cloze' ? item.reveal : item.answer} />
      <MediaImage path={item.answerImage} />
      {item.extra && <Md class="extra" text={item.extra} />}
      {item.hint && item.kind !== 'cloze' && <p class="hint">{t('study.hint', { h: item.hint })}</p>}
      <div class="face-tools">
        <AudioButton
          path={item.answerAudio}
          text={item.answerAudio ? '' : item.answer}
          lang={langOf(set, item, 'answer')}
        />
      </div>
    </div>
  );
}
