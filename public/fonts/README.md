# Polices de lecture

Polices proposées dans Réglages › Apparence (`src/ui/themes.js` : `READING_FONTS`, `@font-face` en tête
de `src/styles.css`). Toutes sont sous [SIL Open Font License 1.1](https://openfontlicense.org) ; le
texte de chaque licence est à côté des fichiers et copié avec eux dans `dist/fonts/`. Seules les
graisses 400 et 700, en romain, sont fournies (le navigateur incline lui-même l'italique).

| Police                | Fichiers                        | Provenance                                                                                                                                                                   |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenDyslexic          | `OpenDyslexic-*.woff2`          | [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic), dossier `compiled/`, commit `77bda89f3f2069c78d81d33de43b461c2de6c48e` (avril 2025), non modifiés |
| Atkinson Hyperlegible | `atkinson-hyperlegible-*.woff2` | paquet npm `@fontsource/atkinson-hyperlegible` 5.3.0                                                                                                                         |
| Lexend                | `lexend-*-wght-normal.woff2`    | paquet npm `@fontsource-variable/lexend` 5.3.0 (police variable)                                                                                                             |
| Andika                | `andika-*.woff2`                | paquet npm `@fontsource/andika` 5.3.0                                                                                                                                        |

OpenDyslexic a un nom de police réservé (« Reserved Font Name ») : une version modifiée (découpée,
convertie…) ne pourrait plus s'appeler OpenDyslexic. On distribue donc tels quels les fichiers WOFF2 du
dépôt officiel. Les trois autres n'ont pas de nom réservé ; les fichiers Fontsource sont
découpés en sous-ensembles `latin` et `latin-ext`, chargés selon les caractères affichés
(`unicode-range`).

Mettre à jour : remplacer les fichiers en gardant leurs noms (sinon adapter les `@font-face`), puis
reporter la version ou le commit ci-dessus.
