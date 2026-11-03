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

/** Pied de fiche, sous un trait comme l'en-tête : indice et exemple. */
function FaceFoot({ hint, example }) {
  if (!hint && !example) return null;
  return (
    <div class="face-foot">
      {hint && (
        <div class="foot-row foot-hint">
          <span class="foot-label">{t('study.hintLabel')}</span>
          <span>{hint}</span>
        </div>
      )}
      {example && (
        <div class="foot-row foot-example">
          <span class="foot-label">{t('study.exampleLabel')}</span>
          <Md text={example} />
        </div>
      )}
    </div>
  );
}

/**
 * Une face de carte et son pied (indice : au recto si `showHint`, jamais au verso, qui donne la réponse ;
 * exemple : au verso). `recall` : au verso, rappelle la question au-dessus de la réponse,
 * sauf si l'apparence le masque (`style.recall`).
 */
export function CardFace({ item, set, side, showHint = false, recall = false }) {
  // texte à trous : un indice déjà écrit dans le trou ([indice]) n'est pas répété en bas
  const inBlank = item.kind === 'cloze' && !!item.hint && item.prompt.includes(item.hint);
  const foot =
    side === 'prompt' ? <FaceFoot hint={showHint && !inBlank && item.hint} /> : <FaceFoot example={item.example} />;
  if (item.kind === 'occlusion') {
    return (
      <>
        <div class="face-content occ-face">
          {item.prompt && <Md text={item.prompt} />}
          <OcclusionView occ={item.occlusion} side={side} />
          {side === 'answer' && item.answer && (
            <p class="occ-answer">
              <strong>{item.answer}</strong>
            </p>
          )}
          {side === 'answer' && item.extra && <Md class="extra" text={item.extra} />}
          {side === 'answer' && item.answerAudio && (
            <div class="face-tools">
              <AudioButton path={item.answerAudio} text="" />
            </div>
          )}
        </div>
        {foot}
      </>
    );
  }
  if (side === 'prompt') {
    return (
      <>
        <div class="face-content">
          <Md text={item.prompt} />
          <MediaImage path={item.promptImage} />
          <div class="face-tools">
            <AudioButton
              path={item.promptAudio}
              text={item.promptAudio ? '' : item.prompt}
              lang={langOf(set, item, 'prompt')}
            />
          </div>
        </div>
        {foot}
      </>
    );
  }
  return (
    <>
      <div class="face-content">
        {/* rappel de la question (sauf texte à trous : la phrase révélée la contient déjà) */}
        {recall && item.kind === 'basic' && item.style?.recall !== 'hide' && (
          <div class="face-recall">
            <Md text={item.prompt} />
            <MediaImage path={item.promptImage} />
          </div>
        )}
        <Md text={item.kind === 'cloze' ? item.reveal : item.answer} />
        <MediaImage path={item.answerImage} />
        {/* complément d'un texte à trous ; l'exemple d'une carte simple est dans le pied */}
        {item.extra && item.kind !== 'basic' && <Md class="extra" text={item.extra} />}
        <div class="face-tools">
          <AudioButton
            path={item.answerAudio}
            text={item.answerAudio ? '' : item.answer}
            lang={langOf(set, item, 'answer')}
          />
        </div>
      </div>
      {foot}
    </>
  );
}
