# Corbeille V2 — feuille de route

Mise à jour du 18/11/2026. Chaque lot s'utilise seul ; la V1 reste en production tant qu'un lot ne la remplace pas.

## Ordre des lots

| Lot | Contenu | État |
| --- | --- | --- |
| 1 | Liaison Drive (Apps Script, À traiter, exports StorePOS automatiques, liste partagée) | fait |
| 2a | Étiquettes épicerie, planche A4 identique à la V1 | fait (PR #3) |
| 2c | Travailler une facture : lecture, écarts de prix d'achat, prix de vente suggéré (règles V1) | lecture faite (PR #4) ; **en cours : écriture des prix et du stock** |
| 2b | Affiches fruits et légumes (règles V1, affichage « conforme » sur iPad) | à faire |
| 3 | Réception et À traiter : file réparée, compteur honnête, cash & carry reconnu | à faire (liste des bugs attendue) |
| 4 | Fichier d'import StorePOS complet (25 colonnes, modes 1/2/3, test sur une ligne) | à faire |
| 5 | Produits inconnus en caisse, OpenFoodFacts, code PIN par caissier | à faire |
| 6 | **Achat refondu : « Conseil d'achat » par fournisseur** (À prendre cette fois, À ne pas prendre, promo manuelle ; DLUO par famille ; calcul sur les ventes, stock affiché mais jamais décisif) | spec complète attendue |
| 7 | Inventaire (après le gros inventaire physique) | à faire, pas avant |
| 8 | **Mode Ramadan** | teaser fait, code après validation |

## Lot 8 — Mode Ramadan

- **Dates** : table statique `v2/donnees/ramadan.json` (début du jeûne et Aïd en France, 2014 à 2030, Grande Mosquée de Paris). Pas de calendrier hégirien calculé. Les années prévisionnelles se corrigent à la main après la Nuit du doute.
- **Alerte** : à J-30 du début, une tuile « Préparer le Ramadan » apparaît sur l'accueil.
- **Écran** : les produits saisonniers (dattes, chorba, feuilles de brick, frik, laben, raib…), et pour chacun « L'an dernier tu as vendu X, cette année prévois Y ».
- **Calcul** : moyenne des ventes des Ramadans passés (période exacte de chaque Ramadan, jamais « même mois l'an dernier »), corrigée par la tendance des 3 dernières semaines, bornée par la DLUO (sinon « prends N maintenant, le reste en plusieurs fois »). Réutilise le moteur du lot 6.
- **Prérequis** : un export Vente PLU de StorePOS par Ramadan passé, sur ses dates exactes. À vérifier : jusqu'à quelle année l'historique de la caisse remonte.
- **Calendrier** : Ramadan 2027 attendu le 8 février, donc tuile visible vers le 9 janvier 2027. Pour servir dès 2027, le lot doit être prêt début janvier.

## Critères de succès

1. Le gérant (iPhone 13 mini) fait seul chaque tâche du lot, sans aide.
2. Aucune régression de la V1, en ligne et hors ligne.
3. Aucun prix inventé ; aucune écriture dans StorePOS sans le geste du gérant ; FACTURES ACHAT jamais modifié.
4. Une facture se traite en moins de 2 minutes.
5. Moins de visites fournisseurs (cible Metro et Promocash : une par mois au lieu d'une par semaine), sans produit périmé.
6. **Capacité à anticiper les pics de vente saisonniers sans rupture de stock.**
