import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Article } from "@/content/blog";
import { getCategory, readingMinutes } from "@/content/blog";
import type { Crumb } from "@/lib/site";
import { DemoDialog } from "../demo-dialog";
import { Footer } from "../footer";
import { Header } from "../header";
import { inline } from "./prose";

/**
 * Cadre des pages de contenu (blog, pages par métier) : le même en-tête et le
 * même pied de page que l'accueil, dont les liens ramènent à ses sections, et
 * la fenêtre de demande de démo — tout bouton « démo » l'ouvre ici aussi.
 * Pages calmes : aucune animation au défilement, tout le texte est dans le
 * code de la page.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <Header home={false} />
      <main id="contenu">{children}</main>
      <Footer home={false} />
      <DemoDialog />
    </>
  );
}

/** Données structurées d'une page (schema.org), une balise par objet. */
export function JsonLd({ data }: { data: object | readonly object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, index) => (
        // Le contenu vient de nos propres données ; `<` est neutralisé pour ne jamais fermer la balise
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }} />
      ))}
    </>
  );
}

/** `current` : le dernier élément est la page affichée (sans lien). Sinon tous sont des liens : la page est nommée par son titre, juste dessous. */
function Breadcrumb({ crumbs, current = true }: { crumbs: readonly Crumb[]; current?: boolean }) {
  return (
    <nav aria-label="Fil d'Ariane">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-white/70">
        {crumbs.map((crumb, index) => {
          const last = current && index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="inline-flex items-center gap-1.5">
              {index > 0 ? <ChevronRight size={14} aria-hidden className="text-white/40" /> : null}
              {last ? (
                <span aria-current="page" className="text-white/90">
                  {crumb.label}
                </span>
              ) : (
                <a href={crumb.href} className="focus-ring-dark rounded py-1 underline-offset-4 hover:text-white hover:underline">
                  {crumb.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Haut d'une page de contenu : bandeau bleu nuit (l'en-tête fixe s'y lit en
 * blanc, comme sur l'accueil), fil d'Ariane, titre de la page, phrase
 * d'introduction, puis ce que la page ajoute (boutons, date…).
 */
export function PageHero({
  crumbs,
  title,
  lead,
  children,
  narrow = false,
  titleInTrail = true,
}: {
  crumbs: readonly Crumb[];
  title: string;
  lead?: string;
  children?: ReactNode;
  narrow?: boolean;
  /** Faux pour un article : son titre, long, ne se répète pas dans le fil d'Ariane juste au-dessus de lui */
  titleInTrail?: boolean;
}) {
  return (
    <section className="relative overflow-hidden bg-night-900 pt-28 pb-14 text-white md:pt-36 md:pb-20">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(58rem_28rem_at_85%_-10%,rgb(14_151_221/0.3),transparent_62%),radial-gradient(40rem_22rem_at_0%_110%,rgb(106_95_214/0.2),transparent_60%)]" />
      <div className={`relative mx-auto px-5 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>
        <Breadcrumb crumbs={titleInTrail ? crumbs : crumbs.slice(0, -1)} current={titleInTrail} />
        <h1 className="font-display mt-5 max-w-4xl text-[2.25rem] leading-[1.1] font-bold text-balance sm:text-5xl md:text-[3.4rem]">{inline(title, { strong: "font-bold text-white" })}</h1>
        {lead ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-white/85 md:text-xl">{inline(lead, { strong: "font-semibold text-white" })}</p> : null}
        {children}
      </div>
    </section>
  );
}

const PRIMARY =
  "cta focus-ring inline-flex min-h-12 items-center rounded-full bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-md shadow-black/20 transition-[background-color,scale] hover:bg-primary-700 active:scale-[0.98]";
const GHOST_DARK =
  "focus-ring-dark inline-flex min-h-12 items-center rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-base font-semibold text-white transition-[background-color,scale] hover:bg-white/20 active:scale-[0.98]";

/** Bouton de démo : il ouvre la fenêtre de demande (ou mène au formulaire de l'accueil sans JavaScript). */
export function DemoButton({ label = "Demander ma démo gratuite", className = "" }: { label?: string; className?: string }) {
  return (
    <a href="/#demo" className={`${PRIMARY} ${className}`}>
      {label}
    </a>
  );
}

export function GhostButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className={GHOST_DARK}>
      {label}
    </a>
  );
}

/** Bandeau d'appel à la démo, en fin de page ou au fil d'un article. */
export function CtaBand({ title, text, secondary }: { title: string; text: string; secondary?: { href: string; label: string } }) {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-night-900 px-6 py-10 text-white sm:px-10 md:py-12">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_90%_0%,rgb(14_151_221/0.35),transparent_60%)]" />
      <h2 className="font-display max-w-2xl text-2xl leading-tight font-bold text-balance sm:text-3xl">{inline(title, { strong: "font-bold text-white" })}</h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-white/85">{inline(text, { strong: "font-semibold text-white" })}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <DemoButton />
        {secondary ? <GhostButton {...secondary} /> : null}
      </div>
    </div>
  );
}

/** Questions fréquentes : chaque réponse est dans la page (elle se déplie), lisible sans JavaScript. */
export function FaqList({ faq }: { faq: readonly { q: string; a: string }[] }) {
  return (
    <div className="space-y-3">
      {faq.map((item) => (
        <details key={item.q} className="group rounded-2xl border border-cream-200 bg-white open:shadow-[var(--shadow-card)]">
          <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-lg font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
            <h3 className="font-title">{inline(item.q)}</h3>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-primary-700 transition-transform group-open:rotate-90" />
          </summary>
          <p className="px-5 pb-5 text-[1.0625rem] leading-[1.7] text-ink-700">{inline(item.a)}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * Carte d'un article, pour les listes du blog. `heading` : le niveau du titre
 * de la carte, selon ce qui la précède dans la page.
 */
export function ArticleCard({ article, featured = false, heading: Heading = "h3" }: { article: Article; featured?: boolean; heading?: "h2" | "h3" }) {
  const category = getCategory(article.category);
  return (
    <article className={`group relative flex h-full flex-col rounded-3xl border border-cream-200 bg-white shadow-[var(--shadow-card)] transition-[border-color,translate] hover:-translate-y-0.5 hover:border-primary-300 ${featured ? "p-7 sm:p-9" : "p-6"}`}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
        <span className="rounded-full bg-primary-50 px-3 py-1 font-semibold text-primary-800">{category?.label}</span>
        <span>{readingMinutes(article)} min de lecture</span>
      </p>
      <Heading className={featured ? "font-display mt-4 text-2xl leading-tight font-bold text-balance text-ink-900 sm:text-3xl" : "font-title mt-4 text-xl leading-snug font-bold text-ink-900"}>
        <a href={`/blog/${article.slug}`} className="focus-ring rounded after:absolute after:inset-0 after:rounded-3xl">
          {inline(article.title)}
        </a>
      </Heading>
      <p className={`mt-3 flex-1 leading-relaxed text-ink-700 ${featured ? "max-w-3xl text-lg" : "text-base"}`}>{inline(article.excerpt)}</p>
      <p aria-hidden className="mt-5 text-base font-semibold text-primary-700 group-hover:text-primary-800">
        Lire l&apos;article
      </p>
    </article>
  );
}
