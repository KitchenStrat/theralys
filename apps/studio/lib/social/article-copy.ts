/**
 * Article du blog prêt à être repris sur un autre site (« Copier l'article »,
 * section Publications). Quand le site du client est la référence des outils,
 * les articles paraissent toujours sur le blog hébergé, et le praticien les
 * publie chez lui en les copiant : le presse-papiers reçoit l'article en
 * texte mis en forme (HTML, pour les éditeurs de site) et en texte brut.
 *
 * Le seul rendu markdown de l'espace de travail est `react-markdown`,
 * dépendance du site public (`apps/sites/components/markdown.tsx`) et de lui
 * seul : le studio ne peut pas l'importer. Ce module convertit donc lui-même
 * le markdown des articles, pour le sous-ensemble qu'ils emploient (cf.
 * ARTICLE_STRUCTURE, `@theralys/ai`) : intertitres, paragraphes, listes à
 * puces et numérotées, citations, gras, italique, liens. Comme sur le site
 * public (`skipHtml`), le HTML écrit dans le markdown n'est jamais repris :
 * tout texte est échappé, seules les balises produites ici sortent.
 *
 * Fonctions pures, sans dépendance au navigateur : testées sans DOM.
 */

import { slugify } from "@theralys/shared";

// ─── Blocs ───────────────────────────────────────────────────────────────────

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const BULLET_RE = /^\s*[-*+•][ \t]+(.*)$/;
const NUMBERED_RE = /^\s*(\d{1,3})[.)][ \t]+(.*)$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * Découpe le markdown d'un article en blocs. Tolérant : une ligne qui suit
 * sans ligne vide un élément de liste ou une citation la prolonge, des
 * éléments de liste séparés par une ligne vide restent une seule liste (la
 * numérotation ne repart pas à 1), une sous-liste est ramenée au niveau de sa
 * liste.
 */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  // Bloc que la ligne suivante peut prolonger (liste ou citation) ; remis à zéro par une ligne vide
  let open: Extract<Block, { kind: "list" | "quote" }> | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  // Scripts et styles écrits dans le markdown : écartés avec leur contenu (les autres balises le sont ligne à ligne, leur texte gardé)
  const source = markdown.replace(/\r\n?/g, "\n").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  for (const raw of source.split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      open = null;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      open = null;
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }
    if (RULE_RE.test(line)) {
      flushParagraph();
      open = null;
      blocks.push({ kind: "rule" });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBERED_RE.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = numbered !== null;
      const item = (bullet ? bullet[1]! : numbered![2]!).trim();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.ordered === ordered) {
        last.items.push(item);
        open = last;
      } else {
        open = { kind: "list", ordered, start: numbered ? Number(numbered[1]) : 1, items: [item] };
        blocks.push(open);
      }
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      flushParagraph();
      if (open?.kind === "quote") {
        open.text = `${open.text} ${quote[1]!.trim()}`.trim();
      } else {
        open = { kind: "quote", text: quote[1]!.trim() };
        blocks.push(open);
      }
      continue;
    }

    // Ligne de texte : suite de l'élément de liste ou de la citation en cours, sinon paragraphe
    if (open?.kind === "list") {
      const index = open.items.length - 1;
      open.items[index] = `${open.items[index] ?? ""} ${line.trim()}`.trim();
    } else if (open?.kind === "quote") {
      open.text = `${open.text} ${line.trim()}`.trim();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks.filter((block) => (block.kind === "quote" || block.kind === "paragraph" || block.kind === "heading" ? block.text !== "" : true));
}

// ─── Texte en ligne ──────────────────────────────────────────────────────────

type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

/** Balises écrites dans le markdown (jamais reprises, comme sur le site public) et commentaires HTML. */
const RAW_HTML_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>/g;
/** Lettre, chiffre ou tiret bas : un `_` collé à l'un d'eux fait partie d'un mot (nom_de_fichier), pas d'une mise en forme. */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

/** Adresse reprise telle quelle dans un lien : absolue (web, e-mail, téléphone). Un lien relatif ne mènerait nulle part sur un autre site. */
function isPortableHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(href);
}

/** Mise en forme repérée dans une ligne ; `build` n'est appelé que pour celle qui est retenue (la plus à gauche). */
type InlineMatch = { index: number; length: number; build: () => Inline[] };

/** Première mise en forme `marker…marker` à partir de `from` dont le contenu ne commence ni ne finit par une espace. */
function findDelimited(src: string, from: number, marker: string, wordBound: boolean): { index: number; inner: string } | null {
  // Un marqueur précédé d'une barre oblique inverse (« \* ») est un caractère, pas une mise en forme
  const nextMarker = (at: number): number => {
    let index = src.indexOf(marker, at);
    while (index > 0 && src[index - 1] === "\\") index = src.indexOf(marker, index + 1);
    return index;
  };
  let start = nextMarker(from);
  while (start !== -1) {
    const end = nextMarker(start + marker.length + 1);
    if (end === -1) return null;
    const inner = src.slice(start + marker.length, end);
    const before = start > 0 ? src[start - 1]! : "";
    const after = src[end + marker.length] ?? "";
    const valid =
      inner !== "" &&
      !/^\s|\s$/.test(inner) &&
      !inner.includes("\n") &&
      // « * » isolé d'un produit (2 * 3) ou marqueur plus long (« ** » lu comme deux « * ») : pas une mise en forme
      before !== marker[0] &&
      after !== marker[0] &&
      !inner.startsWith(marker[0]!) &&
      !inner.endsWith(marker[0]!) &&
      (!wordBound || (!WORD_CHAR_RE.test(before) && !WORD_CHAR_RE.test(after)));
    if (valid) return { index: start, inner };
    start = nextMarker(start + 1);
  }
  return null;
}

const CODE_RE = /`([^`\n]+)`/g;
const ESCAPE_RE = /\\([\\`*_[\](){}#+\-.!>~|])/g;
const IMAGE_RE = /!\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function firstFrom(re: RegExp, src: string, from: number): RegExpExecArray | null {
  re.lastIndex = from;
  return re.exec(src);
}

/** Adresse entre chevrons (`<https://…>`) : un lien en markdown, à lire avant d'écarter les balises. */
const AUTOLINK_RE = /<(https?:\/\/[^\s<>()[\]]+)>/g;

/** Mise en forme en ligne → arbre : la plus à gauche d'abord, le contenu d'un gras, d'un italique ou d'un lien analysé à son tour. */
function parseInline(source: string, depth = 0): Inline[] {
  const src = depth === 0 ? source.replace(AUTOLINK_RE, "[$1]($1)").replace(RAW_HTML_RE, "") : source;
  const nodes: Inline[] = [];
  const pushText = (text: string) => {
    if (text === "") return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === "text") last.text += text;
    else nodes.push({ kind: "text", text });
  };
  const nested = (inner: string): Inline[] => (depth < 4 ? parseInline(inner, depth + 1) : [{ kind: "text", text: inner }]);

  let pos = 0;
  while (pos < src.length) {
    const candidates: InlineMatch[] = [];
    const code = firstFrom(CODE_RE, src, pos);
    if (code) candidates.push({ index: code.index, length: code[0].length, build: () => [{ kind: "code", text: code[1]! }] });
    const escaped = firstFrom(ESCAPE_RE, src, pos);
    if (escaped) candidates.push({ index: escaped.index, length: escaped[0].length, build: () => [{ kind: "text", text: escaped[1]! }] });
    // Image : seul son texte alternatif est repris (l'image de l'article se télécharge à part)
    const image = firstFrom(IMAGE_RE, src, pos);
    if (image) candidates.push({ index: image.index, length: image[0].length, build: () => (image[1] ? [{ kind: "text", text: image[1] }] : []) });
    const link = firstFrom(LINK_RE, src, pos);
    if (link) {
      candidates.push({
        index: link.index,
        length: link[0].length,
        build: () => {
          const children = nested(link[1]!);
          return isPortableHref(link[2]!) ? [{ kind: "link", href: link[2]!, children }] : children;
        },
      });
    }
    for (const [marker, kinds, wordBound] of [
      ["***", ["strong", "em"], false],
      ["**", ["strong"], false],
      ["__", ["strong"], true],
      ["*", ["em"], false],
      ["_", ["em"], true],
    ] as const) {
      const found = findDelimited(src, pos, marker, wordBound);
      if (!found) continue;
      candidates.push({
        index: found.index,
        length: found.inner.length + marker.length * 2,
        // « ***texte*** » : gras et italique à la fois, l'italique à l'intérieur
        build: () => [...kinds].reverse().reduce<Inline[]>((children, kind) => [{ kind, children }], nested(found.inner)),
      });
    }
    // La plus à gauche ; à position égale, la première de la liste (« ** » avant « * »)
    const next = candidates.reduce<InlineMatch | null>((best, candidate) => (best === null || candidate.index < best.index ? candidate : best), null);
    if (!next) {
      pushText(src.slice(pos));
      break;
    }
    pushText(src.slice(pos, next.index));
    for (const node of next.build()) {
      if (node.kind === "text") pushText(node.text);
      else nodes.push(node);
    }
    pos = next.index + next.length;
  }
  return nodes;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeHtml(node.text);
        case "code":
          return `<code>${escapeHtml(node.text)}</code>`;
        case "strong":
          return `<strong>${inlineHtml(node.children)}</strong>`;
        case "em":
          return `<em>${inlineHtml(node.children)}</em>`;
        case "link":
          return `<a href="${escapeHtml(node.href)}">${inlineHtml(node.children)}</a>`;
      }
    })
    .join("");
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.text;
        case "strong":
        case "em":
          return inlineText(node.children);
        case "link": {
          // L'adresse suit le libellé, sauf si le libellé est déjà l'adresse
          const label = inlineText(node.children);
          return label.includes(node.href) ? label : `${label} (${node.href})`;
        }
      }
    })
    .join("");
}

// ─── Article entier ──────────────────────────────────────────────────────────

/** Le titre de l'article est le seul titre de niveau 1 : les intertitres commencent au niveau 2. */
const headingLevel = (level: number): number => Math.min(6, Math.max(2, level));

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "heading": {
      const level = headingLevel(block.level);
      return `<h${level}>${inlineHtml(parseInline(block.text))}</h${level}>`;
    }
    case "paragraph":
      return `<p>${inlineHtml(parseInline(block.text))}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const open = block.ordered && block.start !== 1 ? `<ol start="${block.start}">` : `<${tag}>`;
      return [open, ...block.items.map((item) => `<li>${inlineHtml(parseInline(item))}</li>`), `</${tag}>`].join("\n");
    }
    case "quote":
      return `<blockquote><p>${inlineHtml(parseInline(block.text))}</p></blockquote>`;
    case "rule":
      return "<hr>";
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "quote":
      return inlineText(parseInline(block.text));
    case "list":
      return block.items.map((item, i) => `${block.ordered ? `${block.start + i}.` : "-"} ${inlineText(parseInline(item))}`).join("\n");
    case "rule":
      return "";
  }
}

/** Les deux formes d'un article remises ensemble au presse-papiers : la cible du collage prend celle qu'elle sait lire. */
export type ArticleCopy = {
  /** Article en HTML : titre en `<h1>`, puis le corps — pour les éditeurs de site, qui gardent la mise en forme */
  html: string;
  /** Article en texte brut : titre, puis le corps, blocs séparés par une ligne vide — repli quand le texte riche n'est pas accepté */
  text: string;
};

/**
 * Article prêt pour le presse-papiers : son titre puis son corps (markdown),
 * en HTML et en texte brut. L'image de couverture n'y figure pas : elle se
 * télécharge à part, pour être envoyée sur le site du praticien plutôt que
 * liée depuis le nôtre.
 */
export function articleCopy(article: { title: string; content: string }): ArticleCopy {
  const title = article.title.replace(/\s+/g, " ").trim();
  const blocks = parseBlocks(article.content);
  const html = [...(title !== "" ? [`<h1>${escapeHtml(title)}</h1>`] : []), ...blocks.map(blockHtml)].join("\n");
  const text = [title, ...blocks.map(blockText)].filter((part) => part !== "").join("\n\n");
  return { html, text: `${text}\n` };
}

// ─── Image de couverture ─────────────────────────────────────────────────────

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Nom du fichier de l'image d'un article, en ASCII : le titre de l'article
 * (un nom lisible dans la médiathèque du site du praticien, plutôt que
 * l'identifiant de la banque d'images) et l'extension du type reçu — à
 * défaut celle de l'adresse, sinon `jpg`.
 */
export function articleImageFileName(title: string, mimeType: string | null | undefined, imageUrl?: string): string {
  const name = slugify(title).slice(0, 60).replace(/-+$/, "") || "article";
  const fromType = IMAGE_EXTENSIONS[(mimeType ?? "").split(";")[0]!.trim().toLowerCase()];
  const fromUrl = /\.(jpe?g|png|webp|avif|gif|svg)(?:[?#]|$)/i.exec(imageUrl && !imageUrl.startsWith("data:") ? imageUrl : "")?.[1]?.toLowerCase();
  return `${name}.${fromType ?? (fromUrl === "jpeg" ? "jpg" : fromUrl) ?? "jpg"}`;
}
