// Logique pure des jeux (Association, Gravité) ; le rendu est dans l'UI.
import { shuffle } from './ids.js';
import { checkAnswer, stripMarkdown } from './text.js';

// ------------------------------------------------------------------ Association

/** Plateau d'association : `n` paires mélangées en 2n tuiles. */
export function buildMatchBoard(items, n = 6, rng = Math.random) {
  const picked = shuffle(items, rng).slice(0, n);
  const tiles = [];
  for (const it of picked) {
    tiles.push({ key: it.id + ':p', pairId: it.id, side: 'prompt', text: it.prompt, image: it.promptImage });
    tiles.push({ key: it.id + ':a', pairId: it.id, side: 'answer', text: it.answer, image: it.answerImage });
  }
  return shuffle(tiles, rng);
}

export const isMatch = (a, b) => a.pairId === b.pairId && a.side !== b.side;

/** Temps final avec pénalité (+1 s par erreur). */
export const matchScoreMs = (elapsedMs, mistakes) => elapsedMs + mistakes * 1000;

// ------------------------------------------------------------------ Gravité

/**
 * Jeu « Gravité » : des astéroïdes portant un énoncé tombent ; taper la bonne réponse les détruit.
 * Automate pur : `tick(dtMs)` fait avancer le temps, `submit(text)` valide une saisie.
 */
export class GravityGame {
  constructor(items, { rng = Math.random, lives = 3, typoTolerance = true } = {}) {
    this.items = items;
    this.rng = rng;
    this.lives = lives;
    this.typoTolerance = typoTolerance;
    this.level = 1;
    this.score = 0;
    this.destroyed = 0;
    this.asteroids = [];
    this.sinceSpawn = 0;
    this.nextId = 1;
    this.bag = [];
    this.over = false;
  }

  /** Intervalle entre apparitions (ms) selon le niveau. */
  get spawnEvery() {
    return Math.max(1200, 4200 - (this.level - 1) * 350);
  }

  /** Vitesse de chute en % de la hauteur par seconde. */
  get speed() {
    return 6 + (this.level - 1) * 1.6;
  }

  _draw() {
    if (!this.bag.length) this.bag = shuffle(this.items, this.rng);
    return this.bag.pop();
  }

  spawn() {
    if (!this.items.length) return null;
    const item = this._draw();
    const a = {
      id: this.nextId++,
      itemId: item.id,
      prompt: stripMarkdown(item.prompt),
      answer: item.answer,
      x: 10 + Math.floor(this.rng() * 80), // % horizontal
      y: 0, // % vertical (100 = sol)
    };
    this.asteroids.push(a);
    return a;
  }

  tick(dtMs) {
    if (this.over) return { hit: [] };
    this.sinceSpawn += dtMs;
    if (this.sinceSpawn >= this.spawnEvery || !this.asteroids.length) {
      this.sinceSpawn = 0;
      this.spawn();
    }
    const hit = [];
    for (const a of this.asteroids) a.y += (this.speed * dtMs) / 1000;
    this.asteroids = this.asteroids.filter((a) => {
      if (a.y >= 100) {
        hit.push(a);
        return false;
      }
      return true;
    });
    for (let i = 0; i < hit.length; i++) {
      this.lives--;
      if (this.lives <= 0) {
        this.over = true;
        break;
      }
    }
    return { hit };
  }

  /** Valide une saisie ; détruit l'astéroïde le plus bas qui correspond. */
  submit(text) {
    const matches = this.asteroids
      .filter((a) => checkAnswer(a.answer, text, { typoTolerance: false }).correct)
      .sort((a, b) => b.y - a.y);
    if (!matches.length) return { ok: false };
    const a = matches[0];
    this.asteroids = this.asteroids.filter((x) => x !== a);
    this.destroyed++;
    this.score += 100 + Math.round(a.y);
    if (this.destroyed % 5 === 0) this.level++;
    return { ok: true, asteroid: a };
  }
}
