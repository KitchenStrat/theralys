import { redirect } from "next/navigation";

/** Ancienne section « Mots-clés » : remplacée par « Google Ads » (la carte Visibilité Google vit dans Fiche Google → Visibilité). */
export default function KeywordsPage() {
  redirect("/google-ads");
}
