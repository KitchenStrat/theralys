/**
 * Identité visuelle des étapes du CRM : une couleur et une icône par étape,
 * les mêmes partout (pipeline, liste, fiche, corbeille).
 *
 * Les six étapes en cours portent une teinte chacune, dans un ordre fixe : la
 * couleur suit l'étape, jamais son rang. Cet ordre alterne teintes froides et
 * chaudes pour que deux étapes voisines restent distinctes, y compris en
 * vision daltonienne (écart vérifié entre voisines, contraste d'au moins 3:1
 * sur fond blanc). « Client » et « Perdu » ne sont pas des teintes de série :
 * ce sont les couleurs d'état réussite et échec, toujours accompagnées de
 * leur icône et de leur libellé.
 */

import { CalendarCheck, CircleX, FileText, Inbox, MonitorPlay, PhoneCall, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import type { CrmStage } from "./model";

export const STAGE_COLOR: Record<CrmStage, string> = {
  new: "#0e97dd",
  contacted: "#d9641c",
  qualified: "#0a9d8f",
  demo: "#6a5fd6",
  meeting: "#b98300",
  proposal: "#d2559f",
  won: "#16a34a",
  lost: "#dc2626",
};

export const STAGE_ICON: Record<CrmStage, LucideIcon> = {
  new: Inbox,
  contacted: PhoneCall,
  qualified: Sparkles,
  demo: MonitorPlay,
  meeting: CalendarCheck,
  proposal: FileText,
  won: Trophy,
  lost: CircleX,
};

/** Fonds d'avatar : des teintes douces, sans rapport avec les étapes (elles ne disent que « une autre personne »). */
const AVATAR_TINTS = [
  { background: "#ddf0fd", color: "#0b5280" },
  { background: "#e6e3fb", color: "#4a3fa8" },
  { background: "#d9f2ee", color: "#0b6b62" },
  { background: "#fdebd9", color: "#9a4a12" },
  { background: "#fbe1ef", color: "#9a2f6c" },
  { background: "#e6eff7", color: "#375063" },
] as const;

type Named = { firstName: string; lastName: string; company: string };

/** Une ou deux initiales : celles de la personne, sinon celles du cabinet. */
export function initialsOf(contact: Named): string {
  const person = [contact.firstName, contact.lastName].map((part) => part.trim()).filter(Boolean);
  const words = person.length > 0 ? person : contact.company.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

/** Teinte d'avatar stable pour un même prospect. */
export function avatarTint(contact: Named): { background: string; color: string } {
  const key = `${contact.firstName}${contact.lastName}${contact.company}`;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}
