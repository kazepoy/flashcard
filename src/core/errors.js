// Erreurs et avertissements à code : l'interface affiche la traduction de `error.<code>` (avec `vars`),
// le message français sert aux journaux, aux tests et aux outils sans interface.
export class AppError extends Error {
  constructor(code, message, vars = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.vars = vars;
  }
}

/** Avertissement d'import (non bloquant), même forme qu'une AppError. */
export const warning = (code, message, vars = {}) => ({ code, message, vars });
