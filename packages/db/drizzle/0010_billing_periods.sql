-- Durées de facturation trimestrielle et sur 3 ans (tarif du 17 novembre 2026) :
-- deux valeurs de plus dans le type « billing_period ». Tant que la migration
-- n'est pas appliquée, rien ne casse : seule la conversion d'une démo sur l'une
-- de ces deux durées est refusée par l'admin, avec un message qui le dit.
-- Migration idempotente : rejouable sans risque.
ALTER TYPE "public"."billing_period" ADD VALUE IF NOT EXISTS 'quarterly';--> statement-breakpoint
ALTER TYPE "public"."billing_period" ADD VALUE IF NOT EXISTS 'triennial';
