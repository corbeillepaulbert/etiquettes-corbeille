# Corbeille V2 (PILOT) — feuille de route

Mise à jour du 21/11/2026. Chaque lot s'utilise seul ; la V1 reste en production tant que la V2 ne la remplace pas.

## Fait

| Lot | Contenu | PR |
| --- | --- | --- |
| 1 | Liaison Drive (Apps Script, À traiter, exports StorePOS automatiques, liste partagée) | #1, #2 |
| 2a | Étiquettes épicerie, planche A4 identique à la V1, planche par défaut, PDF sur Mac | #3, #7 |
| 2c | Travailler une facture : lecture, écarts de prix d'achat, prix de vente suggéré, écriture des prix et du stock (fichiers d'import) | #4, #6 |
| 3 (partie) | À traiter en file d'attente : onglets, 3 factures en cours, cache des montants, diagnostics | #8 |
| — | Mode invité pour les étiquettes (code par e-mail, session de 6 h) | #9 |
| 2b | Affiches fruits et légumes, 4 formats identiques à la V1 | #10 |
| 5 | Produits inconnus (file partagée, OpenFoodFacts, création de fiche mode 3) et mode caisse avec PIN | #12 |
| 6 | Conseil d'achat par fournisseur ; exports datés demandés avec leurs dates exactes | #13 |
| 9-12 | Étiquettes à refaire, noms d'étiquette, prix à revoir, point de la semaine (Vente PLU des 7 derniers jours à la place d'un export « CA par jour ») | lots 9 à 12 |
| 8 | Mode Ramadan : Ramadan à Ramadan depuis 2023, tendance, dates limites, tuile à J-30 | #15 |
| — | Correctifs de la fiche de tests du 21/11 : prix unitaires Metro (lots, prix au kilo, cartons), À traiter plus rapide (script v6), « Traitée » qui ne disparaît plus, zoom aux doigts, étiquettes au doigt, tuile Fruits et légumes, factures Agrifresh dans les affiches | #16 |

## À tester sur l'iPhone (avant toute suite)

- Les lots 2b, 5, 6 et 8 n'ont été testés que dans Chrome avec un faux Drive.
- Exports à déposer dans EXPORTS STOREPOS, dates dans le nom du fichier : Vente PLU de chaque Ramadan (23/03 → 20/04/2023, 11/03 → 09/04/2024, 01/03 → 29/03/2025, 18/02 → 19/03/2026) et des 4 et 8 dernières semaines.
- Conseil d'achat : deux choix par défaut à confirmer (usage chez soi la veille comme sur place ; « À ne pas prendre » = aucune vente sur 8 semaines ou baisse de plus de 70 %).

## Trois modes (décision du 21/11/2026)

| Mode | Pour qui | Ce qu'il ouvre |
| --- | --- | --- |
| **Gérant** | le responsable, avec la clé du magasin | tout : factures, À traiter, achats, Ramadan, imports StorePOS, réglages |
| **Caisse** | l'appareil posé à la caisse, caissiers identifiés par PIN | scan → nom et prix ; produit inconnu → signalé ; sortie avec le PIN du responsable (fait, lot 5) |
| **Invité** | une personne venue aider, session de 6 h ouverte par un code envoyé au responsable | les étiquettes (fait) et **l'inventaire connecté** (lot 7) ; jamais les prix d'achat, les factures ni les réglages |

## Lot 7 — Inventaire connecté (mode invité)

- **Le jour J** : le responsable ouvre une session d'inventaire ; il envoie le lien d'invitation à tous les inventoristes, chacun entre son prénom et le code. Tout le monde compte en même temps, chacun sur son téléphone.
- **Compter** : on choisit sa zone (rayon), on scanne, on tape la quantité. Chaque comptage est une ligne à part (qui, quand, zone, produit, quantité) : un produit peut être compté deux fois (deux rayons, deux personnes) sans rien écraser. Hors ligne, les comptages attendent sur le téléphone et partent dès le retour du réseau.
- **Corriger** : un inventoriste voit les comptages des autres sur sa zone et peut en corriger un ; la correction est une nouvelle ligne qui remplace la précédente, avec son nom. L'historique reste visible pour le responsable.
- **Écarts** : le responsable voit en direct l'avancement par zone, les produits comptés deux fois avec des quantités différentes, et ceux qui ne sont pas encore comptés ; il tranche d'un geste.
- **Clôture** : le responsable valide ; l'appli fabrique le fichier de comptage (code-barres | quantité, même format que la V1) pour StorePOS. Les sessions invitées s'arrêtent.
- **Technique** : comptages envoyés par petits paquets dans le Drive (APPLI V2), fusion sans perte (une ligne par comptage, jamais un total écrasé) ; Apps Script tient la charge (20 000 appels par jour, verrou par écriture). À tester avec 5 téléphones avant le jour J.
- **Prérequis** : le mode invité gagne un second usage (« Inventaire ») choisi par le responsable au moment d'inviter ; le fichier de comptage de la V1 reste la référence jusqu'à ce que celui-ci soit validé.

## Reste à faire, dans l'ordre

| Lot | Contenu | État |
| --- | --- | --- |
| 9 | **Étiquettes intelligentes** : l'appli retient le prix imprimé de chaque étiquette ; à chaque export produits, « N étiquettes à refaire » avec la planche prête. Ajout automatique des prix changés par une facture, des fiches créées et des passages en (ou hors) « Top vente ». | fait (lots 9 à 12) |
| 10 | **Refonte du nom produit** : nom court et lisible pour l'étiquette (produit, marque, poids), proposé depuis le nom en caisse et OpenFoodFacts, validé d'un geste, repris sur toutes les étiquettes. | fait (lots 9 à 12) |
| 11 | **Propositions de changement de prix** : après une facture, les hausses de prix d'achat avec le prix suggéré (règle V1) ; sur tout le catalogue, les produits sous 25 % de marge, classés par manque à gagner ; « Prendre » par ligne, un seul fichier d'import, étiquettes ajoutées. | fait (lots 9 à 12) |
| 12 | **Point hebdo sur 7 jours glissants** : achats des 7 jours (factures du Drive, sans export) ; ventes des 7 jours avec un seul petit export par semaine (chiffre d'affaires par jour, demandé le lundi avec ses dates) ; meilleures ventes du dernier gros export, date affichée ; à faire de la semaine (factures, inconnus, étiquettes à refaire, prix à revoir). | fait (lots 9 à 12) |
| 3 (fin) | Réception : factures des grossistes en libre-service (Metro, Promocash) reconnues | à faire |
| 4 | Fichier d'import StorePOS complet (modes 1/2/3 pour toutes les fiches, pas seulement les inconnus) | à faire |
| — | PILOT dans l'appli : nom, icône, couleur indigo (si validé) | à décider |
| 7 | **Inventaire connecté en mode invité** (voir plus haut) | partie 1 faite (zones, code du jour, comptage hors ligne, envoi au Drive, suivi simple, script v7) ; reste : écarts et oublis, stock de référence, rapport d'étape, clôture recalée |
| — | Bascule : la V2 remplace la V1 à la racine, copie de la V1 gardée quelques semaines | après les tests iPhone |

Idée de la maquette non retenue pour l'instant : dates courtes (alerte 10 jours avant la date limite).

## Critères de succès

1. Le gérant (iPhone 13 mini) fait seul chaque tâche du lot, sans aide.
2. Aucune régression de la V1, en ligne et hors ligne.
3. Aucun prix inventé ; aucune écriture dans StorePOS sans le geste du gérant ; FACTURES ACHAT jamais modifié.
4. Une facture se traite en moins de 2 minutes.
5. Moins de visites fournisseurs (cible Metro et Promocash : une par mois au lieu d'une par semaine), sans produit périmé.
6. **Capacité à anticiper les pics de vente saisonniers sans rupture de stock.**
7. Plus aucune étiquette au mauvais prix en rayon.
