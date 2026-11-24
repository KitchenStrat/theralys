/**
 * Demande de démo de la vitrine : un formulaire court (nom, métier, ville,
 * téléphone), puis des précisions facultatives une fois la demande partie
 * (e-mail, site actuel, un mot sur la pratique). Relectures partagées entre
 * la page et son action serveur.
 */

export const DEMO_LIMITS = { name: 120, profession: 120, city: 120, phone: 30, email: 200, site: 200, message: 2000, notes: 4000 } as const;

/**
 * Numéro de téléphone tel qu'il sera rappelé : chiffres seuls, `+` de
 * l'indicatif gardé. Un numéro français compte dix chiffres et commence par
 * 0 ; un numéro écrit avec son indicatif (`+33…`, `0033…`) en compte de huit
 * à quinze. Null pour tout le reste : le formulaire le redemande.
 */
export function callablePhone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > DEMO_LIMITS.phone) return null;
  const compact = raw.trim().replace(/[\s.\-()/]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  const number = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (number.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
  return /^0[1-9]\d{8}$/.test(number) ? number : null;
}

/** Texte d'un champ à une ligne : espaces resserrés, longueur bornée ; vide si ce n'est pas du texte. */
export function cleanLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Note de la demande : « Métier à Ville ». Le CRM y relit le métier et la
 * ville quand il reprend la demande : le format ne change pas.
 */
export function demoLeadNotes(input: { profession?: unknown; city?: unknown }): string {
  return [cleanLine(input.profession, DEMO_LIMITS.profession), cleanLine(input.city, DEMO_LIMITS.city)].filter(Boolean).join(" à ");
}

/** Précisions données après coup : « Site actuel : … — le mot sur la pratique ». Vide s'il n'y a rien à ajouter. */
export function demoDetailsNotes(input: { currentSite?: unknown; message?: unknown }): string {
  const site = cleanLine(input.currentSite, DEMO_LIMITS.site);
  const message = typeof input.message === "string" ? input.message.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, DEMO_LIMITS.message) : "";
  return [site ? `Site actuel : ${site}` : "", message].filter(Boolean).join(" — ");
}

/** Ajoute des précisions à une note existante, sans la dépasser ni la répéter. */
export function appendNotes(existing: string | null | undefined, addition: string): string {
  const base = (existing ?? "").trim();
  const extra = addition.trim();
  if (!extra || base.includes(extra)) return base;
  return (base ? `${base} — ${extra}` : extra).slice(0, DEMO_LIMITS.notes);
}

/** Adresse e-mail plausible : une arobase, un domaine avec un point, pas d'espace. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim();
  if (email.length < 6 || email.length > DEMO_LIMITS.email) return null;
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/.test(email) ? email : null;
}
