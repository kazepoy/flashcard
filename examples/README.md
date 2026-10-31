# Jeu d'exemple

« Visite guidée » (`fr/visite-guidee.flashcard.zip`, `en/guided-tour.flashcard.zip`) est importé
automatiquement à la première ouverture d'une bibliothèque vide, dans la langue de l'interface. On peut
aussi l'ouvrir à la main avec **Importer** ; le réimporter le met à jour sans le dupliquer.

Il montre chaque possibilité d'une carte, la carte elle-même expliquant comment l'obtenir :

- terme / définition : carte simple, indice et exemple, Markdown, image au recto, image au verso ;
- apparence : couleurs, police, taille, alignement, papier, image de fond ;
- texte à trous : un trou, indice dans le trou, plusieurs numéros, trou répété ;
- image masquée : « masquer tout » avec réponses écrites ; « masquer un » avec ellipses et groupes.

Suivent quelques cartes en situation (étiquettes `drapeaux`, `langue`, `culture`, `expressions`).

Généré par `node scripts/gen-examples.mjs` (illustrations et drapeaux dessinés en SVG par le script) :
modifier le script plutôt que les archives.
