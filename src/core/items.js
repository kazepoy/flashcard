// Transforme les cartes d'un jeu en « items d'étude » (ce qui est planifié et interrogé).
import { parseCloze, renderCloze } from './text.js';
import { groupAnswer, groupsOf } from './occlusion.js';
import { mergeStyle } from './style.js';

/**
 * @typedef {Object} Item
 * @property {string} id        identifiant d'item (voir docs/SPEC.md)
 * @property {string} cardId
 * @property {'basic'|'cloze'|'occlusion'} kind
 * @property {string} prompt    énoncé (markdown)
 * @property {string} answer    réponse attendue (markdown)
 * @property {string} reveal    texte affiché au verso (réponse complète)
 * @property {string} extra     complément (définition d'un cloze, exemple…)
 * @property {string} hint
 * @property {string|null} promptImage
 * @property {string|null} answerImage
 * @property {string|null} promptAudio
 * @property {string|null} answerAudio
 * @property {boolean} reversed
 * @property {Object} style     apparence effective (style du jeu complété par celui de la carte)
 * @property {{image:string, masks:Array, n:number, mode:'all'|'one'}} [occlusion]  image masquée : groupe actif `n`
 */

/** Les items d'une carte selon le sens d'étude ('term' | 'def' | 'both'). */
export function expandCard(card, direction = 'term', setStyle = {}) {
  const style = mergeStyle(setStyle, card.style);
  if (card.type === 'occlusion') {
    // un élément par groupe de masques, quel que soit le sens d'étude
    if (!card.image) return [];
    return groupsOf(card.masks || []).map((n) => {
      const answer = groupAnswer(card.masks, n);
      return {
        id: `${card.id}#o${n}`,
        cardId: card.id,
        kind: 'occlusion',
        prompt: card.term,
        answer,
        reveal: answer,
        extra: card.definition,
        hint: card.hint,
        promptImage: null,
        answerImage: null,
        promptAudio: null,
        answerAudio: card.audio,
        reversed: false,
        style,
        occlusion: { image: card.image, masks: card.masks, n, mode: card.occlusion || 'all' },
      };
    });
  }
  if (card.type !== 'basic' && card.type !== 'cloze') return []; // type inconnu : ignoré
  if (card.type === 'cloze') {
    return parseCloze(card.term).map((c) => ({
      id: `${card.id}#c${c.n}`,
      cardId: card.id,
      kind: 'cloze',
      prompt: renderCloze(card.term, c.n, 'blank'),
      answer: c.answer,
      reveal: renderCloze(card.term, c.n, 'reveal'),
      extra: card.definition,
      hint: c.hint || card.hint,
      promptImage: card.termImage || card.image,
      answerImage: null,
      promptAudio: null,
      answerAudio: card.audio,
      reversed: false,
      style,
    }));
  }
  const fwd = {
    id: card.id,
    cardId: card.id,
    kind: 'basic',
    prompt: card.term,
    answer: card.definition,
    reveal: card.definition,
    extra: card.example,
    hint: card.hint,
    promptImage: card.termImage || null,
    answerImage: card.image,
    promptAudio: card.audio,
    answerAudio: null,
    reversed: false,
    style,
  };
  const rev = {
    ...fwd,
    id: `${card.id}~r`,
    prompt: card.definition,
    answer: card.term,
    reveal: card.term,
    promptImage: card.image,
    answerImage: card.termImage || null,
    promptAudio: null,
    answerAudio: card.audio,
    reversed: true,
  };
  const usable = (card.term.trim() || card.termImage) && (card.definition.trim() || card.image);
  if (!usable) return [];
  if (direction === 'def') return [rev];
  if (direction === 'both') return [fwd, rev];
  return [fwd];
}

export function expandSet(set, direction = 'term') {
  return set.cards.flatMap((c) => expandCard(c, direction, set.style));
}

/**
 * Éléments utilisables par un mode : 'text' exige une réponse écrite (Apprendre, Écrire, Test),
 * 'plain' un texte des deux côtés, sans image masquée (Association, Gravité, qui n'affichent que du texte).
 * Une carte dont une face n'est qu'une image (un drapeau…) reste étudiable en fiches et en révision.
 */
export function usableFor(items, need) {
  if (need === 'text') return items.filter((i) => i.answer.trim());
  if (need === 'plain') return items.filter((i) => i.kind !== 'occlusion' && i.prompt.trim() && i.answer.trim());
  return items;
}

export const cardIdOfItem = (itemId) => itemId.split(/[~#]/)[0];

/** Éléments d'étude hors cartes suspendues (progress.suspended). */
export const activeItems = (items, progress) =>
  progress?.suspended ? items.filter((i) => !progress.suspended[i.cardId]?.s) : items;
