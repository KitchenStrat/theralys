/**
 * La page publique d'Harmony, lue comme la lirait un praticien : c'est la
 * seconde source de l'assistant de l'équipe commerciale, après la définition
 * du produit. La page est relue au plus une fois par heure ; ce qui y change
 * (une réponse de la FAQ, un argument) se retrouve dans les réponses sans
 * rien recopier ici.
 *
 * Deux blocs n'en sont pas repris : les témoignages (des illustrations tant
 * que de vrais avis ne les ont pas remplacés — l'assistant ne doit citer
 * aucun client) et le formulaire de demande de démo.
 */

const DEFAULT_URL = "https://www.harmony-web.fr";
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6_000;
/** Une page de présentation tient très en dessous ; au-delà, ce n'est pas elle. */
const MAX_HTML_BYTES = 4_000_000;
export const LANDING_TEXT_MAX = 40_000;

/** Sections de la page laissées de côté. */
const SKIPPED_SECTIONS = new Set(["temoignages", "demo"]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", euro: "€", rsquo: "’", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16) || 32);
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10) || 32);
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Texte d'un fragment de page : ni script, ni style, ni dessin ; une ligne par bloc. */
function textOf(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template|video|picture)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|header|footer|li|ul|ol|h[1-6]|button|a|summary|details|label|tr|figure|figcaption|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) =>
      line
        .replace(/[\s\u00a0\u202f]+/g, " ")
        // Un mot mis en valeur dans la page laisse une espace avant le point ou la virgule qui le suit
        .replace(/ ([.,])/g, "$1")
        .trim()
        // Bandeau qui défile : la même suite de mots, répétée pour boucler, n'est gardée qu'une fois
        .replace(/^(.{8,240}?)(?: \1)+$/, "$1"),
    )
    .filter((line) => line.length > 1);
}

/**
 * Texte de la page publique, section par section, sans les blocs écartés.
 * Les lignes répétées (bandeau qui défile, textes doublés pour l'animation)
 * ne sont gardées qu'une fois.
 */
export function landingTextFromHtml(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1] ?? html;
  // Découpe au début de chaque section nommée : ce qui précède la première est le haut de page
  const parts: { id: string; html: string }[] = [];
  const starts = [...main.matchAll(/<section\b[^>]*\bid="([a-z0-9-]+)"/gi)];
  let cursor = 0;
  let id = "";
  for (const match of starts) {
    parts.push({ id, html: main.slice(cursor, match.index) });
    cursor = match.index ?? cursor;
    id = (match[1] ?? "").toLowerCase();
  }
  parts.push({ id, html: main.slice(cursor) });

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    if (SKIPPED_SECTIONS.has(part.id)) continue;
    for (const line of textOf(part.html)) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  return lines.join("\n").slice(0, LANDING_TEXT_MAX);
}

/** Adresse de la page publique (variable `WEB_BASE_URL`, sinon celle de production). */
export function landingUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.WEB_BASE_URL?.trim();
  if (configured && /^https?:\/\/[^\s/]+/.test(configured)) return configured.replace(/\/+$/, "");
  return DEFAULT_URL;
}

type Cached = { url: string; text: string; at: number };
let cached: Cached | null = null;

export type LandingDeps = { fetch?: typeof fetch; now?: () => number };

/**
 * Texte de la page publique, gardé une heure. Page injoignable : le dernier
 * texte lu sert encore ; s'il n'y en a pas, la chaîne vide — l'assistant
 * répond alors avec la définition du produit et les réponses validées.
 */
export async function loadLandingText(env: NodeJS.ProcessEnv = process.env, deps: LandingDeps = {}): Promise<string> {
  const url = landingUrl(env);
  const now = (deps.now ?? Date.now)();
  if (cached && cached.url === url && now - cached.at < TTL_MS) return cached.text;
  try {
    const response = await (deps.fetch ?? fetch)(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "text/html" }, cache: "no-store" });
    if (!response.ok) throw new Error(`statut ${response.status}`);
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) throw new Error("page trop volumineuse");
    const text = landingTextFromHtml(html);
    if (text.length < 200) throw new Error("page sans texte");
    cached = { url, text, at: now };
    return text;
  } catch (error) {
    console.warn(`[assistant] page publique illisible (${error instanceof Error ? error.message : "erreur"}) : réponse sans elle.`);
    return cached && cached.url === url ? cached.text : "";
  }
}

/** Oublie le texte gardé (tests). */
export function resetLandingCache(): void {
  cached = null;
}
