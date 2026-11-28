# Étiquettes Corbeille — règles du dépôt

Appli de La Corbeille Paul Bert. Deux versions cohabitent sur le même site GitHub Pages
(`corbeillepaulbert.github.io/etiquettes-corbeille/`) :

| Version | Dossier | État |
| --- | --- | --- |
| V1 | racine (`index.html`, `sw.js`) | en production, outil quotidien du gérant. **Aucune régression tolérée.** |
| V2 « Corbeille » | `v2/` | développée par lots, en parallèle. Une seule version fait foi par tâche. |

## Cohabitation V1 / V2 (ne jamais casser)

- La V1 ne se modifie que pour la protéger ou la corriger. Toute modification de la V1 se teste d'abord sur une copie.
- `sw.js` (V1) ignore tout chemin contenant `/v2/` et ne supprime que les caches `cpb-*`.
- `v2/sw.js` ne touche qu'aux requêtes sous `/v2/` et ne supprime que les caches `cbv2-*`.
- Stockage V2 : IndexedDB `corbeille-v2` uniquement. La V2 peut **lire** les clés `cpb_*` de la V1 (même adresse) mais **n'y écrit jamais**.
- Le fichier de comptage (code-barres | quantité) reste produit par la V1 jusqu'au lot Inventaire de la V2.

## Google Drive et Apps Script (lot « liaison Drive »)

### Déploiement imposé
- Application Web Apps Script, propriété du compte Google du magasin.
- **Exécuter en tant que : moi** (le compte du magasin).
- **Qui a accès : Tout le monde.**
- C'est le seul mode compatible avec des caissiers sans compte Google ni connexion OAuth. Tout autre mode doit être justifié par écrit avant d'être proposé.

### Secret partagé, vérifié à chaque appel
- Chaque requête de l'appli est un `POST` (corps JSON envoyé en `text/plain`, pour éviter la pré-vérification CORS) contenant `cle`.
- Le script compare `cle` à la propriété de script `CLE_APPLI` (`PropertiesService.getScriptProperties()`), comparaison à temps constant. Clé absente ou fausse : réponse `{ok:false}` sans aucun détail, rien n'est lu ni écrit.
- **Le secret n'est jamais dans le dépôt** (dépôt public), ni dans une URL, ni dans un journal. Il est saisi une fois par appareil dans Réglages et rangé dans IndexedDB.
- **Rotation** : nouvelle valeur dans `CLE_APPLI`, l'ancienne dans `CLE_PRECEDENTE`, acceptée 7 jours au plus, puis supprimée. Les appareils sont mis à jour dans Réglages pendant ce délai.
- L'URL `/exec` de l'application Web n'est pas non plus dans le dépôt : elle se saisit dans Réglages.

### Mode invité (seule exception à la clé, justifiée)
- Besoin : laisser une personne scanner les produits du rayon, faire une planche d'étiquettes et l'imprimer elle-même, quelques heures, sans lui donner la clé du magasin.
- Le responsable envoie un lien `v2/#invite=<adresse /exec en base64>` (Réglages → Mode invité). L'adresse est dans le fragment : elle ne part jamais sur le réseau. **La clé n'est jamais dans le lien.**
- Deux actions seulement acceptées sans clé : `inviteDemande` (envoie un code à 6 chiffres par `MailApp` à l'adresse du compte du magasin, ou à la propriété `MAIL_ADMIN` ; 5 demandes par heure au plus ; le code n'est jamais renvoyé à l'appli) et `inviteValider` (15 minutes, 5 essais ; renvoie un jeton de session).
- Le jeton vaut 6 h. Il ouvre uniquement `ping`, `exports`, `fichier` (les produits et leurs prix, pour les étiquettes). Jamais les factures, À traiter, le cache, la liste d'achat ni les réglages. Dans l'appli, l'invité n'a que l'écran Étiquettes.
- Code et jetons gardés en empreinte SHA-256 dans les propriétés du script (aucune écriture Drive). « Arrêter les sessions invitées » (avec la clé) les supprime toutes.
- À la fin des 6 h, si le serveur refuse le jeton, ou sur « Quitter le mode invité » : l'appli efface toute la base `corbeille-v2` du téléphone invité.

### Mode inventaire (lot 7, version 6 → 7 du script)
- Le gérant ouvre l'inventaire (clé) : zones et sous-zones, liste des produits à compter réduite au code-barres et au nom (`inventaire-produits.json`, jamais de prix). Fruits et légumes, pain et produits pesés (codes 2…) exclus.
- Lien `v2/#inventaire=<adresse /exec en base64>` (jamais la clé). L'inventoriste tape son prénom et le **code du jour** (6 chiffres, affiché chez le gérant, valable 30 min pour entrer, `invCode`) : `invEntrer` (sans clé, 15 codes faux par quart d'heure au plus) renvoie un jeton valable jusqu'à minuit.
- Le jeton d'inventaire (`jetonInv`) ouvre uniquement `ping`, `invEtat`, `invProduits`, `invEnvoyer`, `invLire`. Dans l'appli, l'inventoriste n'a que les écrans de comptage.
- Chaque comptage est une ligne (id, code, quantité, sous-zone, heure, qui ; `rem` = correction d'une ligne, `ann` = annulation) : rien n'est écrasé. Un fichier par téléphone dans APPLI V2 (`inv-<inventaire>-<appareil>.json`), doublons ignorés.
- Fin de journée, `invFermer` ou « Quitter l'inventaire » : l'appli efface toute la base `corbeille-v2` du téléphone de l'inventoriste.

### Dossier FACTURES ACHAT : lecture seule absolue
- Le script **lit** FACTURES ACHAT et ses sous-dossiers : il **ne déplace rien, ne renomme rien, ne supprime rien, n'écrit rien** dans ce dossier.
- Appels autorisés sur ce dossier et son contenu : `getFolderById`, `getFoldersByName`, `getFolders`, `getFiles`, `searchFiles`, `getName`, `getId`, `getDateCreated`, `getLastUpdated`, `getMimeType`, `getSize`, `getBlob`, et depuis la version 6 `DriveApp.getFileById` + `getParents` (lectures pures : ouvrir une facture par son identifiant et vérifier qu'elle est bien sous FACTURES ACHAT, au lieu de parcourir tout le dossier, qui prenait 30 s et plus).
- Lecture d'une facture à la demande (actions `factures` et `facture`) : liste par `getFolders`/`getFiles` ; ouverture par `getFileById`, contrôle des parents (`getParents`) jusqu'à FACTURES ACHAT, contenu par `getBlob`, rien d'autre. Un identifiant hors de FACTURES ACHAT est refusé.
- Même règle pour EXPORTS STOREPOS : le script n'y fait que lister et lire les fichiers posés directement dans le dossier (pas ANCIENS).
- Même règle pour `SAUVEGARDES STOREPOS › NF525 › DONNEES_ANALYSE` (version 8) : lecture seule (`getFoldersByName`, `getFiles`, `getFilesByName`, `getName`, `getId`, `getLastUpdated`, `getBlob`) de `CA_JOUR_REGLEMENTS.csv`, `CA_JOUR_MENSUELLES.csv` et `LIGNES_PAR_MOIS/LIGNES_TICKETS_AAAAMM.txt` (Windows-1252). **`SAUVEFISCAL` (archives fiscales légales) n'est jamais ouvert.**
- Appels interdits : `moveTo`, `setName`, `setTrashed`, `createFile`, `createFolder`, `addFile`, `removeFile`, `setDescription`, `setSharing`, `setStarred`, et toute écriture équivalente via l'API Drive avancée.
- Les données de la V2 vivent dans un dossier à part, `APPLI V2`. Dext et l'expert-comptable continuent sans intervention.
- Toute revue de code du script commence par une recherche de ces appels interdits.

### Rafraîchissement
- Un déclencheur toutes les 15 minutes cherche les nouvelles factures et les place dans « À traiter ».
- La boîte À traiter a un bouton **« Rafraîchir maintenant »** qui appelle la même fonction tout de suite (verrou `LockService` pour éviter deux passages simultanés) et affiche l'heure du dernier passage.
- Quotas d'un compte gratuit : 90 min par jour de déclencheurs, 6 min par exécution, 20 000 appels sortants par jour.

## Script Apps Script

- Source : `apps-script/Code.gs` (sans aucun secret ni identifiant de dossier). Installation décrite en tête du fichier.
- Écritures du script : uniquement `createFolder` (APPLI V2 et son sous-dossier FACTURES_CACHE, une fois chacun), `createFile` et `setContent` sur les fichiers JSON de APPLI V2 (dont `FACTURES_CACHE/{idFacture}.json` et, depuis la version 8, `jours-AAAAMM.json` : ventes par jour et par code-barres, [quantité, CA TTC]).
- Cache de lecture des factures : le script ne sait pas lire un PDF sans écrire dans le Drive (OCR de l'API Drive avancée = écriture interdite). C'est donc l'appli qui lit la facture (règles V1) et envoie fournisseur / montant / nombre de produits (`cacheEcrire`) ; le script les garde avec, pour empreinte, la date de modification du PDF, et ne les rend (`cacheLire`) que si elle n'a pas changé.
- Version du script : `ping` renvoie `version`. L'appli exige la version 4 ou plus (version 5 pour le mode invité, qui demande d'exécuter `installer()` une fois pour autoriser l'envoi d'e-mails ; version 6 : factures ouvertes par identifiant, un seul fichier par document JSON, index du cache ; version 7 : inventaire connecté ; version 8 : ventes lues dans les tickets de caisse NF525) (Réglages → « Tester la connexion Apps Script »).

## Ventes : tickets de caisse NF525 (version 8)

- Les ventes viennent des lignes de tickets (copie quotidienne des archives fiscales par le PC du magasin, voir le doc du projet « passation-pilot-archives-nf525 »). L'export Vente PLU n'est plus qu'un repli, et les exports RAMADAN deviennent inutiles. L'export produits (catalogue) reste indispensable : prix d'achat, fournisseur, famille.
- Le script résume chaque mois en `jours-AAAAMM.json` (déclencheur de 15 min, seulement les mois modifiés) ; l'action `ventes` renvoie, pour les périodes demandées par l'appli, quantité et CA par code-barres, et le CA officiel par jour (`CA_JOUR_*`, une ligne par date).
- Quantité = « quantité mesure » (kg pour les pesées), retours compris en négatif : c'est exactement la quantité de l'export Vente PLU (vérifié sur le Ramadan 2025 : 828 produits sur 828).
- Dernier jour complet = dernière date de `CA_JOUR_REGLEMENTS` (J-2 le matin). L'appli affiche « ventes à jour au … » et ne présente jamais un jour incomplet.
- Un export Vente PLU ne remplace jamais la référence NF525 : il est rangé comme période.

## Prix d'achat lus sur les factures

- Le moteur de lecture (`v2/js/moteur/facture.js`, repris de la V1) n'est pas modifié. Les corrections passent après lui, dans `v2/js/prix-unitaire.js` : prix d'un lot divisé par sa taille (« X 12 »), prix au kilo écrit sous la ligne Metro pour les fruits et légumes, codes de carton à 14 chiffres ramenés à l'EAN-13 du produit. Entre plusieurs prix possibles, on garde celui qui est le plus proche du prix d'achat StorePOS ; la ligne dit lequel a été pris.

## Code de la V2

- HTML, CSS et JavaScript sans framework ni étape de construction. Modules ES dans `v2/js/`, petits fichiers.
- `v2/js/moteur/` : code repris **à l'identique** de la V1 (lecture Excel, scan, étiquettes épicerie et PDF). Ne pas le réécrire : le scan est validé sur l'iPhone 13 mini du gérant, et la planche V2 doit rester identique au pixel près à celle de la V1 (même police InterE, `v2/fonts/`).
- **Le scan est toujours une action explicite.** Ouvrir un mode ou un écran montre l'état de la tâche (dernière fiche, planche en cours, file d'attente) avec un bouton Scanner ; la caméra ne s'allume jamais d'office.
- Écrans dans `v2/js/ecrans.js` : les mêmes fonctions servent à l'appli et au teaser (`v2/teaser/`).
- Couleurs, tailles et espacements : uniquement les variables de `v2/css/tokens.css`, générées depuis le système graphique « Corbeille V2 ». Texte de 18 px minimum sur iPhone et iPad, cibles de 48 px minimum (56 px pour l'action principale).
- Vocabulaire de l'interface : français simple, tutoiement, verbes d'action (« Scanner », « Ajouter à ma liste »), jamais « OK » seul.
- Règle métier : **aucun prix inventé**. On n'affiche que les prix enregistrés dans StorePOS ; sinon « Prix à définir ».
- Toute action qui change une donnée propose « Annuler » pendant 6 secondes.

## Tester avant de publier

1. Ouvrir `v2/` dans Safari sur l'iPhone 13 mini, l'ajouter à l'écran d'accueil.
2. Mettre à jour les ventes avec les deux exports StorePOS (produits, Vente PLU).
3. Scanner un produit en mode Achat et en mode Magasin, puis un code inconnu.
4. Couper le réseau, relancer l'appli : tout doit encore marcher.
5. Ouvrir la V1 : elle doit être inchangée, y compris hors ligne.
