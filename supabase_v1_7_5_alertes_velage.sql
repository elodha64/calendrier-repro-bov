-- Repro Bovine v1.7.5 — paramètres supplémentaires d'alerte vêlage
-- Ajout uniquement : ne modifie ni le Cron ni l'Edge Function existants.

alter table public.app_settings
  add column if not exists primipara_advance_days integer not null default 20,
  add column if not exists estive_advance_days integer not null default 23;
