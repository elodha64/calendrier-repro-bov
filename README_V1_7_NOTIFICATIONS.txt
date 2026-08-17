REPRO BOVINE V1.7.0 — NOTIFICATIONS APPLI FERMÉE
================================================

À NE PAS FAIRE
--------------
Ne jamais mettre la clé VAPID privée dans GitHub.
Le fichier VAPID_Repro_Bovine_SECRET.txt fourni séparément ne fait PAS partie du ZIP de l'application.

ÉTAPE 1 — SUPABASE / SQL
-----------------------
Dans Supabase > SQL Editor > New query :
1. Ouvrir le fichier supabase_v1_7_notifications.sql
2. Copier tout son contenu
3. Run

ÉTAPE 2 — EDGE FUNCTION
----------------------
Dans Supabase > Edge Functions :
1. Créer une fonction nommée exactement : repro-notifications
2. Remplacer son code par : supabase/functions/repro-notifications/index.ts
3. Ajouter dans les Secrets de la fonction :
   VAPID_PUBLIC_KEY = valeur du fichier secret fourni séparément
   VAPID_PRIVATE_KEY = valeur du fichier secret fourni séparément
   VAPID_SUBJECT = https://gds3265.github.io
4. Déployer la fonction.

ÉTAPE 3 — TEST
--------------
1. Mettre les fichiers de Repro Bovine V1.7.0 sur GitHub Pages.
2. Ouvrir l'application et se connecter à Supabase.
3. Réglages > Notifications.
4. Appuyer sur « Activer sur cet appareil ».
5. Accepter les notifications.
6. Appuyer sur « Tester appli fermée ».

Sur iPhone : Repro Bovine doit être ajoutée à l'écran d'accueil pour recevoir le Web Push.
Faire la même activation sur le téléphone de Franck.

ÉTAPE 4 — CRON
--------------
Quand le test push serveur fonctionne :
1. Supabase > SQL Editor > New query
2. Copier supabase_v1_7_cron.sql
3. Run

Le Cron appelle la fonction toutes les 15 minutes. La fonction compare avec l'heure choisie dans
Réglages > Notifications et n'envoie qu'une seule fois par jour grâce à notification_dispatch_log.

FONCTIONNEMENT
--------------
Le récap peut inclure :
- retours en chaleur
- diagnostics de gestation
- surveillance pré-vêlage
- terme théorique
- surveillance anticipée estive / date incertaine
- post-vêlage
- post-avortement

La notification ouvre Repro Bovine lorsqu'on la touche.


V1.7.1 : correction CORS du test push navigateur + cron sans Vault.
