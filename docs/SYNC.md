# Synchronisation, sauvegarde et partage sans serveur

> Fonctionnalité en développement : testée avec des services simulés, pas encore avec de vrais comptes.

Flashcard n'a ni serveur, ni base de données, ni comptes, et ne doit rien coûter à héberger. Pour
synchroniser plusieurs appareils, sauvegarder automatiquement ou partager un jeu, il s'appuie donc sur
un stockage que l'utilisateur possède déjà. Cette note compare les possibilités et explique les choix.

## Principe commun

Les données restent au format décrit dans [SPEC.md](SPEC.md) : un fichier par jeu, par progression et
par journal, des médias nommés par leur empreinte. La synchronisation (`storage/sync.js`) échange ces
fichiers un par un avec un dossier distant et fusionne les deux versions quand un même fichier a changé
des deux côtés (règles de `core/merge.js`). Un service n'a qu'à fournir quatre opérations : lister,
lire, écrire, supprimer. Rien ne passe par un serveur de Flashcard : les requêtes vont du navigateur de
l'utilisateur à son propre stockage.

## Pourquoi un « identifiant d'application »

Google, Microsoft et Dropbox n'ouvrent leur API qu'aux applications déclarées. L'éditeur de Flashcard
inscrit l'application **une fois** et obtient un identifiant public, lié à l'adresse du site :

- l'écran de connexion affiche « Flashcard veut accéder à… » : l'utilisateur sait à qui il ouvre son
  stockage ;
- un autre site ne peut pas se faire passer pour Flashcard (l'identifiant n'est accepté que depuis les
  adresses déclarées).

Ce n'est pas un outil de suivi : l'éditeur ne reçoit ni les jetons, ni les fichiers, ni l'identité des
utilisateurs ; Flashcard n'envoie aucune statistique. La console du fournisseur affiche seulement des
compteurs globaux d'appels à l'API. Les utilisateurs n'ont rien à créer : ils se connectent.

Limites : gratuit, quotas très au-dessus des besoins (une synchronisation fait quelques dizaines de
requêtes), stockage pris sur l'espace de chaque utilisateur (fichiers de quelques Mo). L'éditeur doit
fournir une page de confidentialité (la page Aide) et garder le projet actif ; Google retire les
identifiants inutilisés pendant plusieurs mois.

## Possibilités comparées

| Service                 | Identifiant d'app         | Connexion sans clic          | Dossier visible par l'app | Appareils                     |
| ----------------------- | ------------------------- | ---------------------------- | ------------------------- | ----------------------------- |
| Google Drive            | Google Cloud (gratuit)    | 1 h, puis un clic            | son dossier « Flashcard » | tous                          |
| OneDrive                | Microsoft Entra (gratuit) | ~24 h, puis un clic          | `Applications/Flashcard`  | tous                          |
| Dropbox                 | Dropbox (gratuit)         | durable                      | `Applications/Flashcard`  | tous                          |
| WebDAV (Nextcloud, NAS) | aucun                     | durable (mot de passe d'app) | dossier choisi            | tous, si le serveur l'accepte |
| Dossier synchronisé     | aucun                     | durable                      | dossier choisi            | ordinateur, Chrome / Edge     |
| Export / import         | aucun                     | —                            | —                         | tous                          |

**Durée de connexion.** Une application sans serveur ne peut pas garder de secret. Google ne lui
délivre alors qu'un accès d'une heure, sans moyen de le prolonger sans l'utilisateur. Microsoft et
Dropbox acceptent le flux « PKCE », prévu pour ce cas, avec un jeton de rafraîchissement (environ 24 h
pour Microsoft, durable pour Dropbox). Une petite fonction relais gratuite (Cloudflare Workers…)
gardant le secret Google lèverait la limite, mais ce serait du code serveur.

**WebDAV.** Protocole standard (Nextcloud, ownCloud, Synology, QNAP, certains hébergeurs), sans
identifiant d'application : adresse du serveur et mot de passe d'application. Mais un navigateur ne
peut appeler un serveur d'un autre domaine que si celui-ci l'autorise (en-têtes CORS), ce que presque
aucun serveur ne fait par défaut : il faut le configurer (sur Nextcloud, une extension). Bien pour qui
administre son serveur, pas pour le grand public. iCloud n'offre ni WebDAV ni API publique.

**Dossier synchronisé.** Déjà disponible (Réglages › Stockage) : l'utilisateur choisit un dossier de son
Google Drive, OneDrive, Dropbox ou iCloud installé sur l'ordinateur ; le client du service synchronise,
Flashcard fusionne les copies en conflit. Aucun identifiant, mais seulement sur ordinateur avec un
navigateur à base de Chromium (accès aux dossiers).

## Autres pistes

- **Lien de partage autonome.** Un jeu sans images, compressé, tient dans l'adresse elle-même
  (`…/#/import/<données>`) : le destinataire ouvre le lien et importe, sans aucun service. Quelques
  dizaines de Ko passent dans un lien, quelques centaines d'octets dans un QR code. Idéal pour partager
  un petit jeu par message.
- **D'appareil à appareil.** Transfert direct en WebRTC entre deux appareils, appairés en scannant des
  QR codes l'un sur l'autre (pas de serveur de mise en relation). Pratique pour passer sur un nouvel
  appareil ; pas une synchronisation continue.
- **remoteStorage, Solid.** Protocoles ouverts conçus pour les applications sans serveur (stockage
  choisi par l'utilisateur, CORS prévu, sans identifiant d'application) ; très peu de fournisseurs grand
  public.
- **GitHub (Gist ou dépôt).** API ouverte au navigateur avec un jeton personnel : historique des
  versions gratuit ; réservé à un public technique.
- **Sauvegarde vers « Fichiers » sur iPhone / iPad.** Le menu de partage enregistre l'archive dans iCloud
  Drive ; un rappel périodique de sauvegarde rendrait la démarche régulière. Manuel, mais sans rien
  configurer.
- **Relais minimal gratuit.** Une fonction sans état (Cloudflare Workers…) garderait le secret Google
  pour prolonger la connexion, ou relaierait la mise en relation WebRTC. Pas de base de données, mais du
  code serveur.

## Partage d'un jeu

Aujourd'hui : fichier `.flashcard.zip` envoyé par le moyen de son choix (menu de partage du téléphone).
Avec un stockage en ligne, un jeu publié pourrait être partagé par lien (lecture seule, le destinataire
reçoit les mises à jour) ; la coédition à plusieurs est possible avec les mêmes fusions, mais pose des
questions de droits : à traiter plus tard.

## Choix

1. Google Drive : fait (portée `drive.file`, connexion d'une heure).
2. OneDrive : fait (connexion d'environ 24 h, PKCE sans bibliothèque).
3. Dropbox : fait (connexion durable, PKCE avec accès hors ligne).
4. WebDAV : possible plus tard pour les serveurs personnels, avec une notice de configuration CORS.
