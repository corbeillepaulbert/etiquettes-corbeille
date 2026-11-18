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

### Dossier FACTURES ACHAT : lecture seule absolue
- Le script **lit** FACTURES ACHAT et ses sous-dossiers : il **ne déplace rien, ne renomme rien, ne supprime rien, n'écrit rien** dans ce dossier.
- Appels autorisés sur ce dossier et son contenu : `getFolderById`, `getFoldersByName`, `getFolders`, `getFiles`, `searchFiles`, `getName`, `getId`, `getDateCreated`, `getLastUpdated`, `getMimeType`, `getSize`, `getBlob`.
- Lecture d'une facture à la demande (actions `factures` et `facture`) : parcours par `getFolders`/`getFiles`, contenu par `getBlob`, rien d'autre. Un identifiant hors de FACTURES ACHAT est refusé.
- Même règle pour EXPORTS STOREPOS : le script n'y fait que lister et lire les fichiers posés directement dans le dossier (pas ANCIENS).
- Appels interdits : `moveTo`, `setName`, `setTrashed`, `createFile`, `createFolder`, `addFile`, `removeFile`, `setDescription`, `setSharing`, `setStarred`, et toute écriture équivalente via l'API Drive avancée.
- Les données de la V2 vivent dans un dossier à part, `APPLI V2`. Dext et l'expert-comptable continuent sans intervention.
- Toute revue de code du script commence par une recherche de ces appels interdits.

### Rafraîchissement
- Un déclencheur toutes les 15 minutes cherche les nouvelles factures et les place dans « À traiter ».
- La boîte À traiter a un bouton **« Rafraîchir maintenant »** qui appelle la même fonction tout de suite (verrou `LockService` pour éviter deux passages simultanés) et affiche l'heure du dernier passage.
- Quotas d'un compte gratuit : 90 min par jour de déclencheurs, 6 min par exécution, 20 000 appels sortants par jour.

## Script Apps Script

- Source : `apps-script/Code.gs` (sans aucun secret ni identifiant de dossier). Installation décrite en tête du fichier.
- Écritures du script : uniquement `createFolder` (APPLI V2 et son sous-dossier FACTURES_CACHE, une fois chacun), `createFile` et `setContent` sur les fichiers JSON de APPLI V2 (dont `FACTURES_CACHE/{idFacture}.json`).
- Cache de lecture des factures : le script ne sait pas lire un PDF sans écrire dans le Drive (OCR de l'API Drive avancée = écriture interdite). C'est donc l'appli qui lit la facture (règles V1) et envoie fournisseur / montant / nombre de produits (`cacheEcrire`) ; le script les garde avec, pour empreinte, la date de modification du PDF, et ne les rend (`cacheLire`) que si elle n'a pas changé.
- Version du script : `ping` renvoie `version`. L'appli exige la version 4 ou plus (Réglages → « Tester la connexion Apps Script »).

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
