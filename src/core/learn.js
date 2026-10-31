// Mode « Apprendre » : sessions adaptatives par manches (choix multiple → réponse écrite).
import { shuffle } from './ids.js';
import { normalizeAnswer } from './text.js';

/**
 * Construit une question à choix multiple pour `item` avec des distracteurs pris dans `pool`.
 * Renvoie null s'il n'y a pas assez de distracteurs distincts.
 */
export function buildChoices(item, pool, rng = Math.random, n = 4) {
  const correct = normalizeAnswer(item.answer);
  const seen = new Set([correct]);
  const candidates = shuffle(
    pool.filter((p) => p.id !== item.id),
    rng,
  );
  const sameKind = candidates.filter((p) => p.kind === item.kind);
  const ordered = [...sameKind, ...candidates.filter((p) => p.kind !== item.kind)];
  const wrong = [];
  for (const c of ordered) {
    const k = normalizeAnswer(c.answer);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    wrong.push(c.answer);
    if (wrong.length >= n - 1) break;
  }
  if (!wrong.length) return null;
  const options = shuffle([item.answer, ...wrong], rng);
  return { options, correctIndex: options.indexOf(item.answer) };
}

export class LearnSession {
  /**
   * @param {import('./items.js').Item[]} items
   * @param {Object} o
   * @param {Object<string,number>} [o.mastery] niveau initial par itemId (0..2)
   * @param {boolean} [o.multipleChoice]
   * @param {boolean} [o.written]
   */
  constructor(items, { mastery = {}, rng = Math.random, roundSize = 7, multipleChoice = true, written = true } = {}) {
    this.items = items;
    this.byId = new Map(items.map((i) => [i.id, i]));
    this.rng = rng;
    this.roundSize = roundSize;
    this.mc = multipleChoice;
    this.wr = written;
    this.maxLevel = this.mc && this.wr ? 2 : 1;
    this.level = new Map();
    this.stats = new Map(); // id → {correct, wrong}
    for (const it of items) {
      const m = Math.min(mastery[it.id] ?? 0, 2);
      // si un seul type d'épreuve est actif, la maîtrise est plafonnée en conséquence
      this.level.set(it.id, this.maxLevel === 1 ? (m >= 1 ? 1 : 0) : m);
      this.stats.set(it.id, { correct: 0, wrong: 0 });
    }
    this.queue = [];
    this.round = 0;
    this.roundWrong = 0;
    this.roundCorrect = 0;
    this._startRound();
  }

  _unmastered() {
    return this.items.filter((i) => this.level.get(i.id) < this.maxLevel);
  }

  _startRound() {
    const pending = this._unmastered();
    // priorité : déjà commencés / ratés, puis nouveaux
    const started = pending.filter((i) => this.level.get(i.id) > 0 || this.stats.get(i.id).wrong > 0);
    const fresh = pending.filter((i) => !started.includes(i));
    const picked = [...shuffle(started, this.rng), ...fresh].slice(0, this.roundSize);
    this.queue = shuffle(
      picked.map((i) => i.id),
      this.rng,
    );
    this.round++;
    this.roundWrong = 0;
    this.roundCorrect = 0;
  }

  get finished() {
    return this._unmastered().length === 0;
  }

  /** Progression globale. */
  progress() {
    const total = this.items.length;
    const mastered = this.items.filter((i) => this.level.get(i.id) >= this.maxLevel).length;
    const familiar = this.items.filter((i) => this.level.get(i.id) > 0 && this.level.get(i.id) < this.maxLevel).length;
    return { total, mastered, familiar, fresh: total - mastered - familiar };
  }

  /** Question suivante : {item, kind: 'choice'|'write', choices?} ou null. */
  next() {
    if (this.finished) return null;
    if (!this.queue.length) return { roundEnd: true, ...this.roundSummary() };
    const id = this.queue[0];
    const item = this.byId.get(id);
    const level = this.level.get(id);
    const wantChoice = this.mc && (level === 0 || !this.wr);
    if (wantChoice) {
      const ch = buildChoices(item, this.items, this.rng);
      if (ch) return { item, kind: 'choice', ...ch };
    }
    return { item, kind: 'write' };
  }

  roundSummary() {
    return { round: this.round, correct: this.roundCorrect, wrong: this.roundWrong, ...this.progress() };
  }

  /** Passe à la manche suivante après l'écran de résumé. */
  continueRound() {
    if (!this.finished) this._startRound();
  }

  /** Enregistre le résultat de la question courante. */
  answer(correct) {
    const id = this.queue.shift();
    const st = this.stats.get(id);
    if (correct) {
      st.correct++;
      this.roundCorrect++;
      this.level.set(id, Math.min(this.maxLevel, this.level.get(id) + 1));
      if (this.level.get(id) < this.maxLevel) this.queue.splice(Math.min(this.queue.length, 3), 0, id);
    } else {
      st.wrong++;
      this.roundWrong++;
      this.level.set(id, 0);
      this.queue.splice(Math.min(this.queue.length, 2), 0, id);
    }
    return { id, level: this.level.get(id), mastered: this.level.get(id) >= this.maxLevel };
  }

  /** Niveaux à persister dans progress.items[id].mastery. */
  snapshot() {
    return Object.fromEntries(this.items.map((i) => [i.id, this.level.get(i.id)]));
  }
}
