# Révision espacée

Le mode **Révision espacée** est le seul qui planifie : chaque réponse fixe la date à laquelle la carte
reviendra. Les autres modes (Fiches, Apprendre, Écrire, Test, Association, Gravité) servent à s'entraîner
et ne changent pas ces dates.

L'algorithme est **FSRS** (bibliothèque [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs),
version 6), celui d'Anki depuis sa version 23.10, de RemNote ou de Mochi. Les règles ci-dessous suivent
celles d'Anki ; les durées ont été mesurées avec l'application (paramètres FSRS par défaut, rétention visée
90 %).

## États d'une carte

| État                 | Sens                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| **Nouvelle**         | jamais étudiée en révision                                                  |
| **En apprentissage** | vue récemment ; revient dans la journée, par étapes (1 min, puis 10 min)    |
| **En révision**      | sortie de l'apprentissage ; revient dans des jours, des semaines, des mois  |
| **À réapprendre**    | était en révision, ratée (« À revoir ») ; réapprise par une étape de 10 min |

Dans les statistiques, une carte en révision est **à consolider** si sa prochaine révision est à moins de
21 jours, **acquise** au-delà (« young » et « mature » d'Anki, même seuil ; voir [STATS.md](STATS.md)).

## Les quatre réponses

| Réponse       | À choisir quand…           | Effet                                                             |
| ------------- | -------------------------- | ----------------------------------------------------------------- |
| **À revoir**  | la réponse n'est pas venue | la carte recommence et revient dans la séance                     |
| **Difficile** | trouvée, mais avec peine   | progresse peu ; en apprentissage, l'étape est répétée             |
| **Bien**      | trouvée normalement        | progression normale : c'est la réponse la plus fréquente          |
| **Facile**    | trouvée sans effort        | progresse vite ; en apprentissage, la carte en sort tout de suite |

Chaque bouton affiche le délai qu'il donnerait. Il est calculé au moment où la réponse s'affiche, et c'est
exactement ce délai qui est enregistré (voir « Écart aléatoire »).

## Délais selon l'état

| État de la carte                | À revoir                        | Difficile       | Bien            | Facile |
| ------------------------------- | ------------------------------- | --------------- | --------------- | ------ |
| Nouvelle                        | 1 min (séance)                  | 6 min (séance)  | 10 min (séance) | 8 j    |
| En apprentissage (vue une fois) | 1 min (séance)                  | 6 min (séance)  | 1 à 2 j         | 4 j    |
| En révision, intervalle de 11 j | 10 min (séance) → à réapprendre | 32 j            | 46 j            | 77 j   |
| En révision, intervalle de 46 j | 10 min (séance) → à réapprendre | 116 j           | 163 j           | 265 j  |
| À réapprendre                   | 10 min (séance)                 | 15 min (séance) | 2 j             | 3 j    |

« Séance » : la carte revient dans la même séance. Les valeurs varient un peu d'une carte à l'autre (écart
aléatoire, difficulté propre de la carte) et dépendent de la rétention visée.

Règles qui en découlent :

1. **Étapes d'apprentissage : 1 min, puis 10 min** ; réapprentissage : 10 min (valeurs par défaut d'Anki).
2. **Une nouvelle carte demande deux « Bien »** pour sortir de la séance (10 min, puis 1 à 2 jours) ;
   « Facile » la fait sortir tout de suite.
3. **« Difficile » ne fait pas avancer une carte en apprentissage** : à la première étape, il donne la
   moyenne des deux étapes (5 min 30, affiché « 6 min », comme Anki) ; ensuite, il répète l'étape. Une carte
   notée « Difficile » à chaque fois revient donc indéfiniment, jusqu'à un « Bien » ou un « Facile ».
4. **En révision, « Difficile » reste une réussite** : l'intervalle grandit, moins qu'avec « Bien »
   (environ 0,7 fois) ; « Facile » donne environ 1,6 fois celui de « Bien ».
5. **« À revoir » sur une carte en révision la met « à réapprendre »**, qu'elle ait été à consolider ou acquise :
   elle revient dans 10 min, puis repart sur un intervalle court ; FSRS garde son historique (stabilité réduite,
   difficulté un peu plus haute), ce n'est pas un retour à zéro.
6. **La rétention visée** (Réglages › Étude, 90 % par défaut) règle tous les intervalles : FSRS programme
   chaque carte au moment où la probabilité de s'en souvenir tombe à cette valeur. Plus haute, intervalles
   plus courts et révisions plus nombreuses.

## La séance

### File du jour

Au début d'une séance, la file du jour (`core/daily.js`, `buildQueue` dans `core/srs.js`) réunit :

- les cartes **en apprentissage** dont l'échéance tombe dans les 20 prochaines minutes ;
- les cartes **en révision** dues d'ici la fin de la journée, dans la limite de **révisions par jour** ;
- des cartes **nouvelles**, dans la limite de **nouvelles cartes par jour** (Réglages › Étude).

Les limites s'appliquent **par jeu** et comptent les réponses de révision espacée déjà données dans la
journée sur ce jeu (`progress.daily`). Une date d'examen (page du jeu) impose son propre rythme de nouvelles cartes. Les cartes
suspendues (bouton pause) sont exclues.

Une fois la file vide, **« Réviser quand même »** (page du jeu) ou les boutons de fin de séance proposent, selon ce qui reste : 10 nouvelles cartes de plus,
50 révisions de plus, ou les révisions des 7 prochains jours en avance.

### Ordre de présentation

1. les cartes en apprentissage déjà échues ;
2. les révisions ;
3. les nouvelles cartes ;
4. enfin, s'il ne reste rien d'autre, les cartes en apprentissage **en avance** (jusqu'à 20 min, comme le
   « learn ahead limit » d'Anki), la plus proche d'abord.

Jamais deux fois de suite la même carte s'il en reste une autre.

### Quand une carte quitte la séance

Après une réponse, la carte **reste dans la séance** si elle est en apprentissage (ou à réapprendre) **et** si sa
prochaine échéance tombe dans les 20 minutes. Sinon, elle est **terminée** pour aujourd'hui. Une carte en
révision quitte donc toujours la séance, sauf avec « À revoir ».

### Ce qui est affiché

- **Barre de progression**, en deux tons : clair pour les cartes **vues** (au moins une réponse), foncé pour
  les cartes **terminées** (sorties de la séance). Légende : « 1 terminée · 4 vues sur 5 ».
- **Compteurs** au-dessus de la carte, pour ce qui reste dans la séance : **nouvelles**, **en
  apprentissage** (reviendront sous peu), **à réviser** (comme les nombres bleu, rouge et vert d'Anki).
- **Fin de séance** : nombre de cartes révisées, délai de la prochaine révision, et de quoi réviser plus (nouvelles cartes, révisions, avance).

## Écart aléatoire

FSRS ajoute un petit écart aléatoire aux intervalles de révision (le « fuzz » d'Anki), pour que les cartes
apprises ensemble ne reviennent pas toutes le même jour. Cet écart dépend de l'heure exacte du calcul :
l'instant est donc **figé à l'affichage de la réponse** et sert à la fois aux délais affichés sur les boutons
et à l'enregistrement (`ui/study/review.jsx`). Un test vérifie que le délai annoncé est celui enregistré.

## Différences avec Anki

- **Paramètres FSRS par défaut** : Anki peut les optimiser sur l'historique de l'utilisateur ; Flashcard
  enregistre cet historique au bon format (`logs/`, voir [STATS.md](STATS.md)) mais ne l'optimise pas encore.
- **Étapes non réglables** : 1 min et 10 min pour l'apprentissage, 10 min pour le réapprentissage.
- **Pas de délai supplémentaire** sur les cartes en apprentissage (Anki ajoute jusqu'à 5 min, sans
  l'afficher).
- **Annuler la dernière réponse** n'est pas proposé dans la séance.

## Pourquoi FSRS : les algorithmes de répétition espacée

| Algorithme                   | Année     | Principe                                                                                                                                                | Utilisé par                                                                     |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pimsleur (rappel gradué)     | 1967      | intervalles fixes croissants (5 s, 25 s, 2 min, 10 min…), identiques pour tous                                                                          | méthodes audio Pimsleur                                                         |
| Leitner                      | 1972      | des boîtes : une carte réussie monte d'une boîte (revue plus rarement), une carte ratée revient à la première                                           | fiches papier, applications simples                                             |
| SM-2 (SuperMemo 2)           | 1987      | formule : un « facteur de facilité » par carte, ajusté selon la note, multiplie l'intervalle                                                            | Anki (historique), Mnemosyne, options de RemNote, Mochi, Obsidian               |
| SM-17 / SM-18                | 2016-2019 | modèle à deux composantes (stabilité, rappel) appris sur l'historique                                                                                   | SuperMemo (propriétaire)                                                        |
| HLR (régression de demi-vie) | 2016      | apprentissage automatique : prédit la « demi-vie » de chaque mot d'après des millions d'élèves et les traits du mot                                     | Duolingo                                                                        |
| Ebisu                        | 2017      | modèle bayésien : une loi de probabilité du rappel, mise à jour à chaque réponse                                                                        | quelques applications libres                                                    |
| **FSRS**                     | 2022      | modèle DSR (difficulté, stabilité, rappel), paramètres optimisables sur l'historique de l'utilisateur, rétention visée choisie ; FSRS-6 : 21 paramètres | Anki (option depuis la 23.10), RemNote (recommandé), Mochi, Obsidian, Flashcard |

**Duolingo** n'est pas un logiciel de cartes : son modèle HLR estime pour chaque mot la probabilité qu'il
soit oublié et choisit les mots à faire réviser dans les exercices (un autre modèle, « Birdbrain », règle
leur difficulté). L'élève ne note rien : la réussite à l'exercice tient lieu de note.

**Quizlet** a changé plusieurs fois :

- le **Learn** d'origine posait une question par terme et reposait celles ratées jusqu'à tout réussir :
  répétition dans la séance, pas espacée ;
- **Long-Term Learning**, un vrai planning espacé proche de SuperMemo et d'Anki, a été **retiré** : la plupart
  des utilisateurs n'étudient un jeu que sur un à quatre jours, trop peu pour cet algorithme ;
- depuis 2017, **Learn** classe les cartes d'une séance selon une probabilité de rappel prédite par
  apprentissage automatique, sans vraiment suivre l'élève d'un jour à l'autre ; un suivi espacé fondé sur un
  « Memory Score » et des révisions programmées l'a complété depuis.

**Choix de Flashcard.** Les modes d'entraînement (Apprendre, Écrire, Test, jeux) jouent le rôle des séances à
la Quizlet ; la révision espacée suit FSRS, comme Anki et RemNote :

- c'est l'algorithme ouvert considéré aujourd'hui comme le plus précis, et il vise une **rétention choisie**
  plutôt que des intervalles fixes ;
- ses implémentations sont libres et maintenues (`ts-fsrs` en JavaScript), avec un optimiseur des paramètres ;
- il reprend les étapes d'apprentissage d'Anki, ce qui rend les jeux importés d'Anki familiers.

Piste : optimiser les paramètres FSRS sur l'historique de chaque utilisateur, comme Anki ; les journaux sont
déjà au bon format.

### Sources

- Anki : [options du paquet](https://docs.ankiweb.net/deck-options.html) (étapes, « Difficile » à la première
  étape, avance de 20 min, FSRS) et [étude](https://docs.ankiweb.net/studying.html) (boutons, écart
  aléatoire)
- FSRS : [ABC of FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs),
  [awesome-fsrs](https://github.com/open-spaced-repetition/awesome-fsrs) (applications qui l'utilisent),
  [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- RemNote : [Spaced Repetition](https://www.remnote.com/feature/spaced-repetition),
  [fsrs4remnote](https://github.com/open-spaced-repetition/fsrs4remnote) ; Obsidian :
  [obsidian-spaced-repetition-recall](https://github.com/open-spaced-repetition/obsidian-spaced-repetition-recall)
- Quizlet : [Spaced Repetition for All](https://quizlet.com/blog/spaced-repetition-for-all-cognitive-science-meets-big-data-in-a-procrastinating-world),
  [Introducing the new Quizlet Learn](https://quizlet.com/blog/introducing-the-new-quizlet-learn),
  [Campus Technology (2017)](https://campustechnology.com/articles/2017/03/09/quizlet-debuts-study-feature-that-helps-students-study-efficiently.aspx)
- Duolingo (HLR) : Settles et Meeder, « A Trainable Spaced Repetition Model for Language Learning », ACL 2016
- Vue d'ensemble : [Spaced repetition (Wikipédia)](https://en.wikipedia.org/wiki/Spaced_repetition),
  [Unbounded Human Learning: Optimal Scheduling for Spaced Repetition](https://arxiv.org/pdf/1602.07032)

## Dans le code

| Fichier               | Rôle                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `core/srs.js`         | `Scheduler` (FSRS : réponse, aperçu, rétention), `buildQueue`, `SrsSession` |
| `core/daily.js`       | file du jour : limites, examen, « étudier plus »                            |
| `core/progress.js`    | `applySrsResult` : état de la carte et compteurs du jour                    |
| `ui/study/review.jsx` | écran de révision : file, boutons, barre de progression, compteurs          |
| `test/core.test.js`   | planification, séance, file du jour, délai annoncé = délai enregistré       |
