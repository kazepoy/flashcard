# Statistiques

Comment Flashcard calcule ses statistiques, d'où viennent les chiffres et comment ils survivent à la synchronisation
entre appareils. Tout est calculé sur l'appareil, à partir des fichiers de la bibliothèque : rien n'est envoyé ailleurs.

## Les deux sources

| Fichier              | Contenu                                                                                                                      | Sert à                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `progress/<id>.json` | État actuel de chaque carte (FSRS : échéance, stabilité, difficulté…), compteurs du jour (`daily`), records des jeux, examen | ce qui décrit **maintenant** : répartition, échéances, mémoire |
| `logs/<id>.jsonl`    | Une ligne par réponse, jamais modifiée : date, carte, mode, note, temps passé, état FSRS avant la réponse                    | ce qui décrit **le passé** : historique, rétention, heures     |

Le format des deux fichiers est décrit dans [SPEC.md](SPEC.md).

## Ce que montre chaque vue

### Page d'un jeu

Calculée par `computeStats` ([core/stats.js](../src/core/stats.js)) sur les cartes **actives** (les cartes suspendues
sont exclues).

- **Vues / maîtrisées** : une carte est vue dès sa première réponse ; maîtrisée quand son intervalle FSRS atteint
  21 jours (ou, hors révision espacée, après deux bonnes réponses dans les modes simples).
- **Score mémoire** : moyenne de la probabilité de rappel actuelle des cartes vues (selon FSRS, elle baisse avec le
  temps jusqu'à la prochaine révision).
- **Série** : jours consécutifs avec au moins une réponse ; la journée en cours ne casse pas la série.
- **Carte d'activité** (18 semaines) et **prévision** (cartes à revoir sur 14 jours, les retards comptés aujourd'hui).
- **Plan d'examen** : nombre de nouvelles cartes à introduire par jour pour les avoir toutes vues la veille de
  l'examen (le dernier jour est gardé pour réviser).

### Page Statistiques

Calculée par [core/analytics.js](../src/core/analytics.js), pour un jeu ou pour toute la bibliothèque.

| Vue                                            | Source      | Ce qui est compté                                                                                     |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Calendrier d'activité, série                   | les deux    | réponses par jour, tous modes (voir « Synchronisation »)                                              |
| Révisions espacées par jour                    | journal     | réponses en révision espacée, par catégorie : en apprentissage, à réapprendre, à consolider, acquises |
| Rétention réelle                               | journal     | part des révisions réussies (toute note sauf « À revoir »), à consolider et acquises à part           |
| Heures de la journée, notes données            | journal     | révisions espacées des 30 derniers jours                                                              |
| À venir                                        | progression | échéances des 30 prochains jours                                                                      |
| Cartes (répartition)                           | progression | état actuel : nouvelles, en apprentissage, à réapprendre, à consolider, acquises                      |
| Intervalles, difficulté, probabilité de rappel | progression | état FSRS actuel des cartes vues                                                                      |

Une carte est **acquise** à partir de 21 jours d'intervalle, **à consolider** en deçà (ce sont les cartes « mature » et « young » d'Anki, même seuil). Une carte **à réapprendre** était en révision (à consolider ou acquise) et a été ratée à sa dernière révision (« Relearning » d'Anki) ; elle a sa propre part, comme dans Anki. Les catégories du journal utilisent
l'état de la carte **avant** la réponse.

Un seul ordre partout (répartition, graphique des révisions, tableau des notes), du souvenir le moins solide au plus
solide, celui d'Anki : nouvelles, en apprentissage, à réapprendre, à consolider, acquises ; chaque état garde sa
couleur.

**État actuel** (répartition, à venir, intervalles, difficulté, rappel) : seulement les cartes qui existent et ne
sont pas suspendues (`activeProgress`, [core/analytics.js](../src/core/analytics.js)) ; la progression d'une carte
supprimée reste dans le fichier mais n'est plus comptée, une carte suspendue n'est ni comptée ni prévue (une ligne
indique combien sont mises de côté). **Historique** (activité, révisions par jour, rétention, heures, notes) : toutes
les réponses données, y compris sur des cartes supprimées ou suspendues depuis.

## Synchronisation

Chaque appareil écrit ses propres réponses ; à la synchronisation, les fichiers des deux côtés sont fusionnés sans
perte ([core/merge.js](../src/core/merge.js)) :

- **Journal** : union des lignes (sans doublon). Aucune réponse n'est perdue, quel que soit l'ordre des
  synchronisations : c'est la source exacte de l'historique.
- **État des cartes** : pour chaque carte, l'état FSRS de la révision la plus récente l'emporte.
- **Compteurs du jour** : maximum des deux appareils. Si vous révisez 20 cartes sur le téléphone et 30 sur
  l'ordinateur le même jour, le compteur fusionné vaut 30, pas 50.
- **Records des jeux** : le meilleur des deux ; **examen** : le plus récemment défini.

C'est pourquoi la série et les calendriers d'activité (page du jeu et page Statistiques) prennent, pour chaque jour, le
plus grand nombre entre les compteurs et les lignes du journal : avec la synchronisation, le journal donne le vrai total
(50 dans l'exemple).

## Limites

- **Limites quotidiennes** (nouvelles cartes, révisions par jour) : comptées sur chaque appareil, avec les compteurs
  fusionnés par maximum ; deux appareils peuvent ensemble dépasser la limite le même jour.
- **Temps passé** : additionné à partir des compteurs du jour, donc soumis au même maximum.
- **Cartes suspendues** : exclues de la page du jeu et des sessions, mais leurs réponses passées restent dans le
  journal et comptent dans l'historique.
- **Supprimer une carte** n'efface pas ses lignes de journal ; supprimer un jeu efface sa progression et son journal.
- Les réglages (`settings.json`) ne sont pas synchronisés : chaque appareil garde ses limites quotidiennes.
