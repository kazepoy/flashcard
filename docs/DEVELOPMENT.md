# Développer Flashcard

Application web statique (PWA) en JavaScript, interface [Preact](https://preactjs.com/), construite par
[esbuild](https://esbuild.github.io/). Ni serveur ni base de données : tout tourne dans le navigateur
et les données sont des fichiers au format décrit dans [SPEC.md](SPEC.md).

## Commandes

| Commande                           | Rôle                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `npm run build`                    | Construit `dist/` (site statique complet, jeux d'exemple compris)                |
| `npm run dev`                      | Reconstruit `dist/` à chaque modification                                        |
| `npm run serve`                    | Sert `dist/` sur http://localhost:8080 (`PORT=…` pour changer)                   |
| `npm test`                         | Tests unitaires (Node, sans navigateur)                                          |
| `npm run lint` / `npm run format`  | ESLint / Prettier ; `npm run check` : formatage, lint et tests (avant un commit) |
| `node scripts/i18n-add.mjs f.json` | Ajoute des traductions `{ "clé": ["français", "english"] }` aux dictionnaires    |
| `node test/e2e.mjs [dossier]`      | Parcours complet dans Chromium, après `npm run build` ; captures dans `dossier`  |
| `node scripts/gen-examples.mjs`    | Régénère `examples/<langue>/` (jeux d'exemple et `index.json`)                   |
| `node scripts/icons.mjs`           | Régénère les icônes PNG depuis `public/icon.svg`                                 |

## Principes

- **Le format de fichiers est le contrat.** Toute donnée persistante passe par `storage/library.js` et
  suit `SPEC.md` ; un lecteur conserve les champs et les types de cartes qu'il ne connaît pas.
- **Couches.** `core/` (logique pure : ni DOM ni stockage, date et aléatoire injectables), `io/`
  (formats d'échange) et `ai/` ne dépendent jamais de `ui/`. `storage/` lit et écrit les fichiers.
  `ui/` affiche et appelle les autres couches.
- **Aucune chaîne libre dans le CSS ni le HTML** : styles de cartes validés (`core/style.js`), Markdown
  converti en HTML échappé (`core/text.js`).
- **Rien ne sort du navigateur** sans action de l'utilisateur (IA, import par lien).
- **Progression immuable.** `useSetData` fournit `update(fn)` : `fn` modifie une copie, la nouvelle
  version est publiée et enregistrée en différé ; un échec d'enregistrement est notifié.
- **Enregistrer sans écraser.** `Library.saveSet` fusionne avec la version sur disque (la synchronisation
  a pu l'enrichir) ; un jeu ouvert est prévenu des fichiers modifiés par la synchronisation
  (`Library.onExternalChange`) et fusionne sa progression en mémoire.
- **Séance de révision** (`core/srs.js`, `SrsSession`) : jamais deux fois de suite la même carte s'il en
  reste une autre ; compte des cartes vues et terminées (barre de progression en deux tons).
- **Mises à jour** : le service worker active la nouvelle version, la page propose « Recharger » ; la page
  Aide affiche la version et la date du build.
- **Une règle métier, un endroit.** Par exemple la file du jour (limites, examen, « étudier plus ») :
  `core/daily.js`, utilisé par la bibliothèque, la page d'un jeu et la révision.
- **Erreurs à code.** `core/`, `io/`, `storage/` et `ai/` lèvent des `AppError(code, message, vars)`
  (`core/errors.js`) ; l'interface affiche `errorText(e)`, traduction de `error.<code>`.
- **Style imposé** par Prettier (largeur 120) et ESLint (règles recommandées, hooks, `no-shadow`,
  `react/jsx-no-undef`) : `npm run check` doit passer.

## Arborescence

```
src/
├─ main.jsx, styles.css   entrée ; styles (jetons de thème en tête)
├─ core/        format (modèle, normalisation), ids, text (réponses, trous, Markdown), items (cartes →
│               éléments d'étude), srs (FSRS, séance de révision), daily (file du jour), progress, learn,
│               test, games, stats, analytics, search, occlusion, style, merge (conflits), errors
├─ storage/     stores (mémoire, IndexedDB, dossier réel), library (jeux, progressions, journaux, médias),
│               sync (synchronisation fichier par fichier), gdrive, onedrive, dropbox (dossiers distants)
├─ io/          Anki .apkg (import / export), CSV / TSV / Quizlet, Markdown, archive .flashcard.zip
├─ ai/          génération de cartes (API Anthropic ou compatible OpenAI, consigne copier-coller), PDF
└─ ui/
   ├─ app.jsx         racine : barre de navigation, bandeaux, page courante
   ├─ ctx.js          contexte global, routeur (parseRoute → routeOf), useAsync ; routes.jsx : pages
   ├─ use-library.js  cycle de vie de la bibliothèque ; boot.js : ouverture du stockage ;
   │                  first-run.js : première ouverture (langue, exemples) ; storage-notice.jsx
   ├─ useSet.js       chargement d'un jeu, progression immuable (update), enregistrement différé
   ├─ components.jsx  fiche, dialogue, icônes, médias, audio, raccourcis, notifications
   ├─ library.jsx     bibliothèque ; import-dialog.jsx ; ai-dialog.jsx
   ├─ setpage.jsx     page d'un jeu, partage, export ; print.jsx : impression / PDF
   ├─ editor.jsx      éditeur ; card-editor.jsx, style-panel.jsx, media-field.jsx, languages.js ;
   │                  occlusion.jsx : image masquée ; media.js : allègement des images
   ├─ browse.jsx      navigateur de cartes ; stats.jsx, charts.jsx : statistiques
   ├─ settings.jsx    réglages ; themes.js : thèmes ; help.jsx : aide et crédits
   ├─ sync-page.jsx   Réglages › Synchronisation ; use-sync.js : services et déclencheurs ;
   │                  google-auth.js, microsoft-auth.js, dropbox-auth.js : connexions (pkce.js commun)
   ├─ i18n.js         t(), tn() ; locales/ : un dictionnaire par langue
   └─ study/          un fichier par mode d'étude ; face.jsx affiche une face de carte
public/        index.html, manifeste, service worker, icônes
examples/      jeux d'exemple par langue (générés)
scripts/       serveur local, icônes, jeux d'exemple, ajout de traductions
test/          tests unitaires (node:test) et e2e.mjs
```

## Routes

| Adresse                                                                 | Page                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `#/`                                                                    | Bibliothèque                                                                                                                 |
| `#/set/<id>`                                                            | Page d'un jeu                                                                                                                |
| `#/set/<id>/edit[/<carte>]`                                             | Éditeur                                                                                                                      |
| `#/set/<id>/study/<mode>[/more]`                                        | Étude (`review`, `flashcards`, `learn`, `write`, `spell`, `test`, `match`, `gravity`) ; `more` : au-delà des limites du jour |
| `#/set/<id>/print`                                                      | Impression / PDF                                                                                                             |
| `#/browse[/<requête>]`, `#/stats[/<id>]`, `#/settings[/sync]`, `#/help` | Cartes, statistiques, réglages, aide                                                                                         |

## Flux des données

1. `boot.js` ouvre le dossier mémorisé (s'il est autorisé) ou le stockage du navigateur ;
   `first-run.js` traite une bibliothèque vide (langue du navigateur, exemples de `examples/<langue>/`) ;
   `Library.resolveConflicts()` fusionne les copies en conflit.
2. Une page charge un jeu et sa progression (`useSetData`). Les modes d'étude appellent
   `update(fn)` et `log(ligne)` ; l'enregistrement est différé et regroupé.
3. `Library` sérialise les écritures par fichier ; une lecture attend les écritures en cours.
4. Au retour au premier plan, les fichiers sont relus (un autre appareil a pu les modifier).

## Synchronisation

Choix et comparaison des services (Google Drive, OneDrive, Dropbox, WebDAV…) : [SYNC.md](SYNC.md).
Calcul des statistiques et effet de la synchronisation sur elles : [STATS.md](STATS.md).
Fonction IA (consignes, fournisseurs, réponse attendue) : [IA.md](IA.md).

`storage/sync.js` compare chaque fichier (`sets/`, `progress/`, `logs/`, `media/` ; pas les réglages) à
son état lors de la dernière synchronisation : un seul côté a changé → recopie ; les deux → fusion
(`core/merge.js`) ; un côté supprimé sans que l'autre change → suppression propagée. Une carte
supprimée laisse une marque dans `deleted` (voir SPEC.md). Le dossier distant implémente
`list / read / write / remove` : `storage/gdrive.js` pour Google Drive (portée `drive.file`, dossier
« Flashcard »), un faux en mémoire pour les tests ; le test e2e simule la connexion et le Drive.
`ui/use-sync.js` lance la synchronisation à l'ouverture, au retour au premier plan, 4 s après une
écriture (`Library.onWrite`) et toutes les 5 minutes. Sans serveur, le jeton Google dure une heure :
ensuite la synchronisation se met en pause et un clic la reprend.

**Identifiant Google** (une fois, gratuit) :

1. [console.cloud.google.com](https://console.cloud.google.com) : créer un projet, puis activer
   « Google Drive API » (API et services › Bibliothèque).
2. Écran de consentement OAuth : type « Externe », nom et e-mail de contact, lien de confidentialité
   (la page `#/help` du site), portée `…/auth/drive.file` ; publier l'application.
3. Identifiants › Créer un ID client OAuth › « Application Web » ; origines JavaScript autorisées :
   l'adresse du site (ex. `https://kazepoy.github.io`) et `http://localhost:8080` pour essayer.
4. Fournir l'identifiant au build : variable de dépôt `GOOGLE_CLIENT_ID` (Settings › Secrets and
   variables › Actions › Variables) pour GitHub Pages, ou `GOOGLE_CLIENT_ID=… npm run build`. Sans lui,
   l'option Google Drive est grisée. Pour un essai sans reconstruire : clé `flashcard.googleClientId`
   dans le stockage local du navigateur.

**Identifiant Microsoft** (OneDrive, une fois, gratuit) :

1. [entra.microsoft.com](https://entra.microsoft.com) (ou portail Azure › Microsoft Entra ID) ›
   Inscriptions d'applications › Nouvelle inscription : nom « Flashcard » ; types de comptes « Comptes
   dans un annuaire organisationnel et comptes Microsoft personnels ».
2. URI de redirection, plateforme **Application monopage (SPA)** : l'adresse exacte de la page
   d'accueil, barre finale comprise (`https://kazepoy.github.io/flashcard/`, `http://localhost:8080/`).
3. Autorisations d'API › Microsoft Graph › délégué : `Files.ReadWrite.AppFolder` et `offline_access`.
4. Copier l'ID d'application (client) ; aucun secret. Le fournir au build : variable `MS_CLIENT_ID`
   (comme `GOOGLE_CLIENT_ID`), ou clé `flashcard.msClientId` dans le stockage local pour un essai.

La connexion (`ui/microsoft-auth.js`) suit le flux « code d'autorisation + PKCE » dans une fenêtre qui
revient sur le site (`handleAuthRedirect`, au démarrage) ; le jeton de rafraîchissement renouvelle
l'accès sans clic pendant environ 24 h. Fichiers dans `Applications/Flashcard` (`storage/onedrive.js`).

**Clé d'application Dropbox** (une fois, gratuite) :

1. [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) › Create app : « Scoped access »,
   accès **App folder**, nom « Flashcard ».
2. Onglet Permissions : cocher `files.metadata.read`, `files.content.read`, `files.content.write`, puis Submit.
3. Onglet Settings : Redirect URIs `http://localhost:8080/` et `https://kazepoy.github.io/flashcard/` ;
   « Allow public clients (Implicit Grant & PKCE) » : Allow.
4. Copier l'**App key** (le secret ne sert pas) et la fournir au build : variable `DROPBOX_APP_KEY`, ou clé
   `flashcard.dropboxAppKey` dans le stockage local pour un essai. En « développement », une application
   Dropbox accepte un nombre limité d'utilisateurs ; demander le passage en production depuis la console.

Connexion PKCE avec accès hors ligne (`ui/dropbox-auth.js`, sur `ui/pkce.js`, commun avec OneDrive) : le
jeton de rafraîchissement ne périme pas, la synchronisation reste connectée. Fichiers dans
`Applications/Flashcard` (`storage/dropbox.js`).

## Traduction

Clés « espace.nom » et un dictionnaire par langue : `ui/locales/fr.js` (référence) et `en.js`.
`t('set.exportTitle', { title })`, `tn('common.nCards', n)` ; un pluriel est `{ one, other }`, la
forme est choisie par `Intl.PluralRules`. Une clé absente d'une traduction retombe sur le français.
`test/i18n.test.js` exige les mêmes clés, variables et formes dans chaque langue, l'existence de
toute clé utilisée et l'absence de clé orpheline ; le test e2e échoue sur toute clé inconnue.
Ajouter une langue : copier `locales/en.js`, l'enregistrer dans `i18n.js`, l'ajouter au choix des
réglages et créer `examples/<langue>/`.

## Thèmes

`ui/themes.js` décrit chaque thème (jetons de couleur, polices éventuelles, base claire ou sombre).
Les thèmes « Clair » et « Sombre » existent aussi en CSS (`styles.css`) pour l'affichage avant le
chargement du script ; `test/themes.test.js` vérifie qu'ils concordent et que tous les thèmes
respectent les contrastes WCAG AA. Les autres thèmes ne s'appliquent qu'à l'écran : l'impression
reste en noir sur blanc.

## Tests

- `npm test` : cœur, imports / exports (dont un paquet produit par Anki, `test/fixtures/`), stockage,
  IA (client simulé), thèmes, traductions.
- `test/e2e.mjs` (lancé plusieurs fois de suite pour vérifier sa stabilité) : création, chaque mode d'étude, apparence, image masquée, navigateur, statistiques,
  exports et PDF, IA par copier-coller, thèmes, première ouverture, remise à zéro, anglais, mobile,
  synchronisation Google Drive, OneDrive et Dropbox (simulées) entre deux appareils, cartes suspendues, import en copie.
  Toute erreur de console ou clé de traduction inconnue fait échouer le parcours.
- L'import / export `.apkg` a été vérifié avec le vrai Anki (paquet Python `anki` 26.09).

## Déploiement

`dist/` se publie sur n'importe quel hébergement statique. `.github/workflows/pages.yml` teste,
construit et publie sur GitHub Pages à chaque push sur `main` (à activer une fois : Settings → Pages
→ Source « GitHub Actions » ; Pages exige un dépôt public ou une offre payante).

## Dépendances

| Paquet                              | Usage                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| `preact`                            | Interface                                                        |
| `ts-fsrs`                           | Algorithme de révision espacée FSRS                              |
| `jszip`                             | Archives `.flashcard.zip` et `.apkg`                             |
| `sql.js`, `fzstd`                   | Bases Anki (SQLite, compression zstd)                            |
| `pdfjs-dist`                        | Texte des PDF pour l'IA (chargé à la demande)                    |
| `esbuild`, `playwright-core` (dév.) | Construction ; test e2e et icônes avec le Chromium de la machine |
| `prettier`, `eslint` (dév.)         | Formatage, analyse statique                                      |

## Limites connues et pistes

- Synchronisation : pas de synchronisation quand l'application est fermée ; connexion limitée à 1 h
  (Google) ou ~24 h (Microsoft), durable avec Dropbox.
- Planification Anki ni importée ni exportée ; style des cartes non exporté vers `.apkg`.
- Import par lien d'un jeu Quizlet public impossible (CORS) : passer par l'export texte de Quizlet.
- Contraste du texte garanti par rapport à la couleur de fond d'une carte, pas à son image de fond.
- Images d'une carte hors de la trame du papier ligné (leur hauteur dépend de leurs proportions).
- Boutons audio imbriqués dans la fiche cliquable (`role="button"`) : à revoir pour l'accessibilité.
- Accès à un vrai dossier seulement sur les navigateurs de bureau à base de Chromium.
