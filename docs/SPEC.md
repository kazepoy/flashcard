# Flashcard — format de stockage ouvert (v1)

Une **bibliothèque Flashcard** est un simple dossier de fichiers JSON et de médias.
Aucun fichier binaire propriétaire, aucune base de données : tout est lisible,
diffable (git) et synchronisable avec n'importe quel outil (Syncthing, Nextcloud,
Dropbox, rsync…). Tous les fichiers sont en UTF-8, JSON indenté de 2 espaces.

```
ma-bibliotheque/
├─ flashcard.json              manifeste de la bibliothèque
├─ settings.json               préférences (sans secret)
├─ sets/<setId>.json           contenu d'un jeu de cartes
├─ progress/<setId>.json       état d'apprentissage (FSRS, maîtrise, étoiles…)
├─ logs/<setId>.jsonl          historique des révisions, une ligne JSON par révision
└─ media/<sha256>.<ext>        images et audio (nom = SHA-256 du contenu, dédupliqué)
```

Le **contenu** (`sets/`) est séparé de la **progression** (`progress/`, `logs/`) :
on peut partager un jeu sans partager son historique.

Versions : `version` est un entier. Un lecteur DOIT ignorer les champs inconnus
et refuser d'écrire un fichier dont la `version` est supérieure à celle qu'il connaît.

## Identifiants

`id` : chaîne de 26 caractères, alphabet Crockford base32 (ULID) : 10 caractères
d'horodatage + 16 aléatoires. Triables par date de création. Immuables.

Dates : ISO 8601 UTC (`2026-10-28T10:00:00.000Z`). Jours : `YYYY-MM-DD` (fuseau local).

## `flashcard.json`

```json
{ "format": "flashcard", "version": 1, "created": "2026-10-28T10:00:00.000Z", "app": "flashcard 0.1.0" }
```

## `sets/<setId>.json`

```json
{
  "format": "flashcard.set",
  "version": 1,
  "id": "01K8…",
  "title": "Vocabulaire espagnol — unité 3",
  "description": "",
  "folder": "Langues/Espagnol",
  "language": { "term": "es", "definition": "fr" },
  "tags": ["espagnol", "A2"],
  "created": "…",
  "updated": "…",
  "cards": [
    {
      "id": "01K8…",
      "type": "basic",
      "term": "la mesa",
      "definition": "la table",
      "hint": "",
      "example": "La mesa es grande.",
      "image": "media/9f86d0….png",
      "audio": null,
      "tags": []
    },
    {
      "id": "01K8…",
      "type": "cloze",
      "term": "La capitale de la France est {{c1::Paris::ville}}.",
      "definition": "Informations complémentaires affichées après la réponse",
      "hint": "",
      "example": "",
      "image": null,
      "audio": null,
      "tags": []
    }
  ]
}
```

| Champ                                   | Type                                    | Notes                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                  | `"basic"` \| `"cloze"` \| `"occlusion"` | `basic` : recto/verso. `cloze` : texte à trous. `occlusion` : image masquée. Un lecteur DOIT conserver sans la modifier une carte de type inconnu et ne pas l'étudier. |
| `term`, `definition`, `hint`, `example` | string                                  | Markdown (gras, italique, code, listes, liens).                                                                                                                        |
| `image`, `audio`                        | string \| null                          | Chemin relatif à la racine de la bibliothèque, dans `media/`.                                                                                                          |
| `language.term/definition`              | string \| null                          | Codes BCP-47, utilisés pour la synthèse vocale.                                                                                                                        |

### Cartes supprimées (facultatif)

`deleted` : `{ "<cardId>": "<date ISO>" }`, cartes supprimées du jeu. Une fusion retire ces cartes des
deux versions et garde l'union des marques (date la plus récente) : une carte supprimée sur un appareil
ne revient pas depuis un autre. Une carte restaurée après coup (« Annuler ») porte `restoredAt` (date ISO) : plus
récente que la marque de suppression, elle l'emporte.

### Apparence (champs facultatifs)

Un lecteur qui ne les connaît pas les ignore.

| Où    | Champ       | Type             | Rôle                                                           |
| ----- | ----------- | ---------------- | -------------------------------------------------------------- |
| jeu   | `color`     | `#RRGGBB`        | couleur de l'onglet du jeu dans la bibliothèque                |
| jeu   | `style`     | objet            | apparence par défaut de toutes les cartes du jeu               |
| carte | `style`     | objet            | apparence de cette carte (complète / remplace celle du jeu)    |
| carte | `termImage` | chemin `media/…` | image illustrant le **terme** (`image` illustre la définition) |

Objet `style` (toutes les clés sont facultatives) :

| Clé       | Valeurs                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bg`      | couleur de fond `#RRGGBB`                                                                                                                 |
| `backBg`  | couleur de fond du verso, si différente                                                                                                   |
| `fg`      | couleur du texte `#RRGGBB` ; le lecteur DOIT la remplacer par une couleur lisible (contraste WCAG ≥ 4,5) si elle ne l'est pas sur le fond |
| `cloze`   | couleur `#RRGGBB` des mots révélés d'un texte à trous ; remplacée par une couleur lisible si besoin, comme `fg`                           |
| `font`    | `serif` \| `sans` \| `mono` \| `hand`                                                                                                     |
| `size`    | `sm` \| `md` \| `lg` \| `xl`                                                                                                              |
| `align`   | `left` \| `center`                                                                                                                        |
| `paper`   | `ruled` (lignes) \| `plain` (uni) \| `grid` (quadrillé) \| `dots` (pointillé)                                                             |
| `bgImage` | chemin `media/…` : image de fond de la carte                                                                                              |

Les valeurs inconnues ou invalides sont ignorées (aucune chaîne libre n'est jamais injectée dans du CSS).
Sans couleur de fond ni de texte, le lecteur applique son thème (clair/sombre).

### Texte à trous (cloze)

Syntaxe compatible Anki : `{{c<n>::réponse}}` ou `{{c<n>::réponse::indice}}`.
Chaque numéro `n` distinct produit une carte d'étude distincte (`<cardId>#c<n>`).

### Image masquée (occlusion)

```json
{
  "id": "01K8…",
  "type": "occlusion",
  "image": "media/9f86d0….png",
  "term": "Os du crâne",
  "definition": "vue de face",
  "occlusion": "all",
  "masks": [
    { "n": 1, "shape": "rect", "x": 0.12, "y": 0.2, "w": 0.3, "h": 0.1, "label": "frontal" },
    { "n": 2, "shape": "ellipse", "x": 0.5, "y": 0.5, "w": 0.2, "h": 0.2 },
    {
      "n": 2,
      "shape": "polygon",
      "x": 0.1,
      "y": 0.1,
      "w": 0.1,
      "h": 0.2,
      "points": [
        [0.1, 0.1],
        [0.2, 0.1],
        [0.15, 0.3]
      ]
    }
  ]
}
```

- `image` : l'image à masquer (obligatoire). `term` : titre affiché au-dessus (facultatif), `definition` : complément affiché avec la réponse.
- `masks[].x, y, w, h` : rectangle englobant **normalisé** (0..1, origine en haut à gauche de l'image) ; `angle` (degrés, facultatif) : rotation autour du coin haut-gauche ; `polygon` : `points` normalisés (le rectangle englobant est redondant).
- `masks[].n` : groupe (≥ 1). Chaque groupe distinct est un item d'étude ; les masques d'un groupe sont révélés ensemble.
- `masks[].label` (facultatif) : réponse écrite du masque ; sans elle, l'item ne sert qu'aux modes auto-évalués (fiches, révision).
- `occlusion` : `all` (tous les masques couverts, on devine le groupe actif) ou `one` (seul le groupe actif est couvert).
- Correspondance Anki (type de note « Image Occlusion ») : `{{c<n>::image-occlusion:rect:left=…:top=…:width=…:height=…:oi=1}}`, `oi=1` ⇔ `all` ; les étiquettes sont exportées dans le champ « Comments ».

### Identifiants d'items d'étude

Un item d'étude est ce qui est planifié par la répétition espacée :

| Cas                                    | `itemId`        |
| -------------------------------------- | --------------- |
| carte `basic`, sens terme → définition | `<cardId>`      |
| carte `basic`, sens définition → terme | `<cardId>~r`    |
| carte `cloze`, trou numéro n           | `<cardId>#c<n>` |
| carte `occlusion`, groupe n            | `<cardId>#o<n>` |

## `progress/<setId>.json`

```json
{
  "format": "flashcard.progress",
  "version": 1,
  "setId": "01K8…",
  "items": {
    "01K8…": {
      "srs": {
        "due": "2026-10-30T10:00:00.000Z",
        "stability": 2.3065,
        "difficulty": 2.1181,
        "elapsed_days": 0,
        "scheduled_days": 2,
        "learning_steps": 0,
        "reps": 1,
        "lapses": 0,
        "state": 2,
        "last_review": "2026-10-28T10:00:00.000Z"
      },
      "mastery": 2,
      "correct": 4,
      "wrong": 1
    }
  },
  "starred": { "01K8…": true },
  "flags": { "01K8…": { "f": 1, "t": "2026-10-28T10:00:00.000Z" } },
  "suspended": { "01K8…": { "s": true, "t": "2026-10-28T10:00:00.000Z" } },
  "daily": { "2026-10-28": { "new": 5, "reviews": 20, "answers": 40, "ms": 183000 } },
  "exam": { "date": "2026-12-15" },
  "games": { "match": { "bestMs": 18420 }, "gravity": { "best": 1250 } }
}
```

- `srs` suit exactement les champs de la carte du planificateur **FSRS**
  (`state` : 0 nouveau, 1 apprentissage, 2 révision, 3 ré-apprentissage).
  Implémentation de référence : `ts-fsrs` / `fsrs-rs` (paramètres par défaut FSRS-6).
- `mastery` (mode Apprendre) : 0 nouveau, 1 choix multiple réussi, 2 maîtrisé.
- `flags` (facultatif) : drapeau de couleur par carte, `f` de 1 à 7 (rouge, orange, vert, bleu,
  rose, turquoise, violet — mêmes numéros qu'Anki), `0` = retiré ; `t` = date du changement.
- `suspended` (facultatif) : cartes suspendues (`s: true`), exclues de l'étude et des comptes jusqu'à
  réactivation (`s: false`) ; `t` = date du changement. Export Anki : file `-1`.

## `logs/<setId>.jsonl`

Une ligne JSON par révision, ajoutée en fin de fichier :

```json
{
  "t": "2026-10-28T10:00:00.000Z",
  "item": "01K8…",
  "mode": "srs",
  "rating": 3,
  "state": 0,
  "due": "…",
  "stability": 0,
  "difficulty": 0,
  "elapsed_days": 0,
  "scheduled_days": 0,
  "ms": 4200
}
```

`mode` : `srs`, `learn`, `test`, `write`, `spell`, `flashcards`, `match`, `gravity`.
`rating` : 1 À revoir, 2 Difficile, 3 Bien, 4 Facile (échelle FSRS).
Les champs `state`…`scheduled_days` sont l'état **avant** la révision : le fichier est
directement exploitable par l'optimiseur FSRS.

## `settings.json`

```json
{
  "format": "flashcard.settings",
  "version": 1,
  "lang": "fr",
  "theme": "auto",
  "language": { "term": "fr", "definition": "fr" },
  "initialized": true,
  "newPerDay": 20,
  "reviewsPerDay": 200,
  "retention": 0.9,
  "typoTolerance": true,
  "tts": true
}
```

`language` : `{ "term": …, "definition": … }`, codes proposés aux nouveaux jeux (comme `language` d'un jeu).
`initialized` : `true` une fois la première ouverture traitée (langue d'après le navigateur, jeux d'exemple
importés si la bibliothèque était vide).
`theme` : `"auto"` (clair ou sombre selon le système) ou l'identifiant d'un thème de l'interface
(`light`, `dark`, `sepia`, `neon`…). Un lecteur applique `"auto"` à un identifiant qu'il ne connaît pas.

La clé d'API du fournisseur d'IA n'est **jamais** écrite dans la bibliothèque
(elle reste dans le stockage local du navigateur) : un dossier peut donc être
partagé ou versionné sans fuite de secret.

## Archive d'échange `.flashcard.zip`

Zip contenant la même arborescence (partielle autorisée) : `flashcard.json`, un ou
plusieurs `sets/*.json`, éventuellement `progress/`, `logs/`, et `media/` pour les
fichiers référencés. Sert à partager un jeu ou à sauvegarder toute une bibliothèque.

## Synchronisation multi-appareils et résolution de conflits

Le format est conçu pour vivre dans un dossier synchronisé (iCloud Drive, Syncthing,
Nextcloud, Dropbox, git…). Chaque donnée vit dans **un fichier par jeu** (`sets/`,
`progress/`, `logs/`) : deux appareils n'entrent en conflit que s'ils modifient le même
jeu au même moment. Les services de synchronisation créent alors une copie à côté
(`<id> 2.json`, `<id> (conflit).json`, `<id>.sync-conflict-….json`).

Un client DOIT, au démarrage, repérer les fichiers dont le nom commence par un `id` de
26 caractères suivi d'un séparateur (espace, `.`, `(`, `-`, `_`) et d'une extension
`.json` / `.jsonl`, les fusionner dans le fichier principal, puis les supprimer.
Les règles de fusion sont **commutatives, associatives et idempotentes** (le résultat
ne dépend ni de l'ordre ni du nombre de fusions ; seule exception, `exam`, où le fichier fusionné en
second l'emporte) :

| Donnée                                  | Règle                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items[id].srs`                         | on garde l'état dont `last_review` est le plus récent (puis `reps`, puis `due`)                                                                            |
| `items[id].mastery`, `correct`, `wrong` | maximum                                                                                                                                                    |
| `starred`                               | union                                                                                                                                                      |
| `flags[id]`                             | celui dont `t` est le plus récent (à égalité, le plus grand `f`)                                                                                           |
| `suspended[id]`                         | celui dont `t` est le plus récent (à égalité, suspendue)                                                                                                   |
| `daily[jour].*`                         | maximum par compteur                                                                                                                                       |
| `games.*.bestMs` / `games.*.best`       | minimum / maximum                                                                                                                                          |
| `exam`                                  | la valeur du fichier fusionné en second si présente, sinon la première                                                                                     |
| `logs/*.jsonl`                          | union des lignes (dédoublonnées), triées par `t`                                                                                                           |
| `sets/*.json`                           | `updated` le plus récent l'emporte ; les cartes absentes de la version récente mais présentes dans l'ancienne sont conservées (on ne perd jamais de carte) |

Les cartes supprimées sont retirées grâce aux marques `deleted` du jeu (voir plus haut).

## Annexe : format Markdown d'échange

Format texte lisible accepté à l'import et produit à l'export (compatible Obsidian).

```markdown
---
title: Capitales
language: fr
tags: [géographie]
---

# France

Paris
Hint: ville lumière

---

# Espagne

Madrid

---

La capitale de l'Italie est {{c1::Rome}}.
```

Les cartes sont séparées par une ligne `---`. Un titre `# …` est le terme, le reste est
la définition (lignes optionnelles `Hint:` et `Example:`). Sans titre, une ligne
`terme :: définition` est une carte simple ; un texte contenant `{{c1::…}}` est un cloze.
