import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOT_FOUND_METADATA } from "@/lib/not-found";

export const metadata: Metadata = NOT_FOUND_METADATA;

/**
 * Attrape-tout sous un site : toute URL profonde inconnue (ex.
 * /<site>/ancien/chemin) rend la page introuvable thématisée du segment
 * ([site]/not-found.tsx) au lieu de la 404 brute de Next. Les routes
 * connues (motifs/[slug], blog, [legal], sitemap.xml) restent prioritaires.
 */
export default function UnknownPathPage(): never {
  notFound();
}
