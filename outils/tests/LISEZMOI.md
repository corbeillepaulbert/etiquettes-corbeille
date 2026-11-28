# Tests de la V2 (outils de développement)

Tests de bout en bout avec Playwright (Chrome sans écran) et un Drive simulé qui exécute `apps-script/Code.gs` tel quel.
Ils ne contiennent aucun secret : la clé et l'adresse `/exec` sont factices. Aucune donnée du magasin n'est dans le dépôt.

## Préparer

1. Servir le dépôt : `python3 -m http.server 8766` depuis la racine (les tests ouvrent `http://localhost:8766/v2/`).
2. Playwright : `/opt/npm-tools/node_modules/playwright`, Chrome : `/usr/bin/google-chrome` (à adapter si besoin).
3. Données réelles, à télécharger depuis le Drive du magasin (jamais à committer) dans `/home/claude/data/` :
   - `produits.xlsx` : dernier export produits de `APPLI ETIQUETTES CORBEILLE › EXPORTS STOREPOS` ;
   - `ventes.xlsx` : un export Vente PLU d'un an (repli) ;
   - pour NF525 : `/home/claude/nf525-test/` avec `CA_JOUR_REGLEMENTS.csv`, `CA_JOUR_MENSUELLES.csv` et `LIGNES_PAR_MOIS/LIGNES_TICKETS_AAAAMM.txt`
     (copiés de `SAUVEGARDES STOREPOS › NF525 › DONNEES_ANALYSE`) ; jamais rien de `SAUVEFISCAL`.
4. Captures d'écran dans `/home/claude/rendu/`.

## Lancer

`node outils/tests/test-nf525.mjs`, `node outils/tests/test-inventaire.mjs`, etc. Chaque test affiche ce qu'il vérifie,
puis `violations` (appels Drive interdits sur un dossier en lecture seule) et `erreurs` (erreurs JavaScript de la page) : les deux doivent être vides.
`test-identique.mjs` vérifie que la planche d'étiquettes V2 est identique au pixel près à celle de la V1.

Certains tests datent leurs attentes (exports « des 4 dernières semaines ») : si un test échoue seulement à cause de la date, refaire ses fichiers de test.
