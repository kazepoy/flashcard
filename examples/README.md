# Jeux d'exemple

« Visite guidée » (`fr/visite-guidee.flashcard.zip`, `en/guided-tour.flashcard.zip`) est importée
automatiquement à la première ouverture d'une bibliothèque vide, dans la langue de l'interface. On peut
aussi l'ouvrir à la main avec **Importer** ; la réimporter la met à jour sans la dupliquer.

C'est une visite en **questions-réponses** : chaque carte répond à une question qu'on se pose en découvrant
Flashcard, et montre la fonction sur elle-même (la carte sur l'indice a un indice, celle sur les trous est un
texte à trous, celle sur l'apparence a sa propre apparence…). Étiquettes : bases, étude, contenu, apparence,
trous, image-masquee, organisation, données.

Générée par `node scripts/gen-examples.mjs` (illustrations dessinées en SVG par le script) : modifier le
script plutôt que les archives.

## Catalogue (à la demande)

D'autres jeux sont proposés dans **Importer › Jeux d'exemple**, et annoncés une fois sur la bibliothèque à la
première ouverture. Ils ne sont pas importés d'office. Chaque langue a son catalogue (`<langue>/catalog.json` :
fichier, identifiant, titre, description, nombre de cartes, possibilités mises en valeur) :

| Jeu | Montre |
| --- | --- |
| Drapeaux et capitales du monde | images au recto, indices pour les paires trompeuses, Association, Gravité |
| Le système solaire | image masquée (planètes), questions d'astronomie |
| Espagnol de voyage · Anglais : faux amis · Allemand : premiers mots (en anglais : Spanish / French for travellers, German first words) | langues des faces, lecture à voix haute, exemples, genre en indice |
| Grandes dates de l'histoire | textes à trous, plusieurs trous par carte |
| Tables de multiplication | apparence du jeu (fonds, grande police centrée), mode Écrire |
| Éléments chimiques (1 à 30) | symbole ↔ nom, numéro atomique en indice |
| Formules de maths et de physique | formules en caractères Unicode, unités en indice |
| Anatomie : premières planches | planches à légender (cœur, squelette, œil), questions de base |

Contenu et illustrations sont écrits et dessinés (SVG) par `scripts/catalog.mjs`, appelé par
`scripts/gen-examples.mjs` : modifier ces scripts plutôt que les archives. Identifiants fixes : ajouter à
nouveau un exemple le met à jour.
