V1.5.0 : tri des vaches par prochaine mise bas présumée et filtres du calendrier. Les alertes post-vêlage sans chaleur sont masquées du calendrier par défaut, mais restent disponibles via le filtre dédié.
V1.4.8 : connexion/authentification refaite avec le client officiel Supabase JS v2 (CDN avec secours jsDelivr/unpkg). Test réseau indépendant du mot de passe.
Repro Bovine v1.4.1
- Ajout du parcours Mot de passe oublié : le lien Supabase ouvre désormais directement un formulaire Nouveau mot de passe.
- Les jetons de récupération sont retirés de l’URL après traitement.

REPRO BOVINE — V1.3

NOUVEAUTÉS V1.3
- Ajout manuel d’une vache depuis l’onglet Vaches.
- Modification de la fiche : n° travail, nom, identifiant national, naissance, race, dernier vêlage et rang.
- Sortie du troupeau avec date et motif facultatif.
- Rubrique Sorties : les vaches restent consultables mais ne génèrent plus d’alertes.
- Réintégration en un clic.
- Import CSV en FUSION : les chaleurs, IA/saillies, diagnostics, vêlages et notes saisis dans l’application sont conservés.
- Les vaches ajoutées manuellement sont conservées lors d’un réimport CSV.
- Une sortie manuelle n’est pas annulée automatiquement par un CSV qui ne porte pas de date de sortie.
- Résumé affiché après import CSV (nouvelles, reconnues/mises à jour, sorties).

IMPORTANT
Avant une grosse mise à jour du troupeau, l’export JSON reste conseillé comme sauvegarde de sécurité.

REPRO BOVINE — V1.0

Application web/PWA indépendante de suivi de reproduction bovine.

Démarrage :
1. Mettre tous les fichiers à la racine d'un dépôt GitHub Pages (ou serveur web).
2. Ouvrir index.html via l'adresse du site.
3. Sur téléphone, ajouter le site à l'écran d'accueil pour un usage type application.

Base initiale : GDS65_ejegou_bovins_07082026235908.csv
- 98 femelles présentes intégrées
- 12 mâles présents listés dans Taureaux
- dernier vêlage/rang reconstitués à partir des veaux historiques lorsque disponibles

Fonctions V1 :
- Tableau Aujourd'hui et 7 jours
- Calendrier jour/semaine/mois
- Recherche vache par nom ou numéro de travail
- Fiche vache + historique des événements
- Chaleur, IA/saillie, gestation confirmée, diagnostic négatif, vêlage
- Taureaux de monte activables + taureaux IA mémorisés
- Statut pleine / supposée pleine avec nombre de jours
- Alertes paramétrables : retour chaleur, diagnostic, pré-vêlage, terme, post-vêlage
- Import CSV GDS
- Export/restauration JSON
- Données enregistrées localement sur l'appareil

Notifications V1 :
- Permission et notification de synthèse disponibles lorsque l'application est ouverte.
- Les notifications push automatiques en arrière-plan nécessiteront un service serveur/push dans une version suivante.


V1.2 — Notifications
- Réglage d’un récap quotidien et de son heure souhaitée.
- Choix des familles d’alertes à notifier.
- Notification de test et statut d’autorisation.
- Notification locale lors de l’ouverture/reprise de la PWA si l’heure est passée.
- Service worker préparé pour les notifications push futures.
IMPORTANT : sans serveur push, iOS/Android peuvent suspendre la PWA ; une notification à heure fixe n’est donc pas garantie lorsque l’app est totalement fermée.


V1.3.3 : ajout d’un âge minimum paramétrable pour le suivi reproduction, liste des femelles hors âge, inclusion forcée au cas par cas et conservation des choix lors des imports CSV.

=== V1.4 — Cloud partagé Supabase ===
- Connexion par email/mot de passe pour Élodie et Franck.
- Même troupeau partagé via Supabase.
- Au premier démarrage : si le cloud est vide, migration automatique des données locales vers Supabase.
- Ensuite : synchronisation des vaches, événements repro, taureaux et principaux réglages.
- Stockage local conservé pour continuer à saisir sans réseau ; resynchronisation au retour d’Internet.
- Indicateur d’état cloud + bouton « Synchroniser maintenant » dans Réglages.
- Les données repro existantes ne sont pas volontairement effacées pendant la migration.

IMPORTANT : la clé intégrée est une clé Supabase publishable (publique), adaptée à une application web protégée par RLS. Ne jamais remplacer par une clé secret/service_role.

Notifications appli fermée : la base et la table push_subscriptions sont prêtes côté Supabase, et le service worker sait recevoir un push. L’envoi serveur planifié (VAPID + Edge Function/cron) reste l’étape suivante avant que l’iPhone puisse recevoir une alerte à heure garantie lorsque l’application est fermée.


V1.4.2 : correctif Safari/iPhone du service worker. Les requêtes Supabase et autres requêtes cross-origin ne sont plus interceptées par le cache PWA. Correctif du flux de récupération de mot de passe.

V1.4.3 : changement de mot de passe depuis Réglages > Cloud partagé pour un utilisateur connecté, sans email de récupération.

V1.5.2 — Gestations estimées / dates incertaines / estive
- Gestation confirmée sans saillie observée : saisie d'une durée précise ou d'une fourchette, en jours ou en mois.
- L'application reconstruit une date centrale probable de fécondation et, si nécessaire, une marge d'incertitude.
- Saillie/IA : possibilité de déclarer une date approximative avec une marge ± X jours.
- Option "Vache en estive" : surveillance vêlage anticipée de 23 jours, sans modifier le terme théorique.
- La fiche conserve le terme central, la fenêtre probable et explique la raison de l'alerte anticipée.
- Ces données sont intégrées aux événements et synchronisées via Supabase sans nouvelle table SQL.

=== V1.6.0 — ESTIVE & LOCALISATION ===

IMPORTANT AVANT UTILISATION PARTAGÉE :
1. Dans Supabase > SQL Editor, exécuter UNE SEULE FOIS le fichier :
   supabase_v1_6_estive_localisation.sql
2. Ensuite seulement, remplacer les fichiers GitHub Pages par la V1.6.0.

Nouveautés :
- onglet « Lieux » ;
- import saisonnier d’un CSV d’estive ;
- les vaches reconnues sont automatiquement marquées « en estive » ;
- la surveillance vêlage est automatiquement avancée de 23 jours pour les vaches en estive ;
- création de lieux : parcelles/prairies, estives, bâtiments, autres ;
- affectation d’une vache à un lieu depuis sa fiche ;
- déplacement groupé de plusieurs vaches ;
- historique des changements de localisation ;
- clôture d’estive : retire automatiquement le statut estive et garde l’historique ;
- les informations de localisation et d’estive sont synchronisées via Supabase entre les deux utilisateurs.

Import estive :
Le fichier est reconnu à partir des colonnes « Identifiant bovin » et/ou « Numéro travail ».
Les animaux absents de la base active sont signalés comme non reconnus, mais aucun animal du troupeau n’est supprimé.
