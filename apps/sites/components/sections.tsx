import Link from "next/link";
import type { ReactNode } from "react";
import type { GoogleReview, Site } from "@theralys/db";
import { reviewDateFr, specialtyIconFor, type Section } from "@theralys/shared";
import { GoogleG, GoogleReviewsCarousel, GoogleStars } from "./google-reviews";
import { Markdown } from "./markdown";
import { RdvButton } from "./rdv-button";

export type SectionContext = {
  site: Site;
  prefix: string;
  reviews: GoogleReview[];
  googleRating: number | null;
  googleReviewCount: number | null;
  /** Fiche Google reliée (avis réels) : identifiant, nom, adresse et photo */
  googlePlaceId?: string | null;
  googleBusinessName?: string | null;
  googleAddress?: string | null;
  googlePhotoUrl?: string | null;
  /** Slugs des pages de motifs visibles (gating par formule) — null = tous */
  allowedMotifSlugs?: string[] | null;
  /** Coordonnées extraites de la section contact (réutilisées par le hero) */
  phone?: string | null;
  address?: string | null;
};

/** Rendu d'une liste de sections typées (contenu structuré, jamais de HTML libre). */
export function Sections({ sections, ctx }: { sections: Section[]; ctx: SectionContext }) {
  const contact = sections.find((s): s is Extract<Section, { type: "contact" }> => s.type === "contact");
  const enriched: SectionContext = {
    ...ctx,
    phone: ctx.phone ?? contact?.phone ?? null,
    address: ctx.address ?? contact?.address ?? null,
  };
  return (
    <>
      {sections.map((section, i) => (
        // data-hy-section : repère utilisé par l'éditeur du studio (EditorBridge)
        <div key={`${section.type}-${i}`} data-hy-section={i}>
          <SectionRenderer section={section} ctx={enriched} />
        </div>
      ))}
    </>
  );
}

function SectionRenderer({ section, ctx }: { section: Section; ctx: SectionContext }) {
  switch (section.type) {
    case "hero":
      return <Hero section={section} ctx={ctx} />;
    case "highlights":
      return <Highlights section={section} />;
    case "specialties":
      return <Specialties section={section} ctx={ctx} />;
    case "future":
      return <Future section={section} ctx={ctx} />;
    case "about":
      return <About section={section} ctx={ctx} />;
    case "reviews":
      return <Reviews section={section} ctx={ctx} />;
    case "process":
      return <Process section={section} ctx={ctx} />;
    case "faq":
      return <Faq section={section} ctx={ctx} />;
    case "contact":
      return <Contact section={section} ctx={ctx} />;
    case "richText":
      return <RichText section={section} />;
    case "cta":
      return <Cta section={section} ctx={ctx} />;
  }
}

// ─── Éléments décoratifs partagés (cf. sites de référence) ───────────────────

/** Petit badge pilule au-dessus des titres de section. */
function Pill({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <span
      className={
        onDark
          ? "inline-block rounded-[var(--r-pill)] border border-current/30 px-5 py-2 text-[0.85rem] font-medium uppercase tracking-wider opacity-90"
          : "inline-block rounded-[var(--r-pill)] bg-[var(--site-soft)] px-5 py-2 text-[0.85rem] font-medium uppercase tracking-wider text-[var(--site-primary-dark)]"
      }
    >
      {children}
    </span>
  );
}

/** Séparateur décoratif : rangée de losanges pointillés. */
function DotsRow({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`flex items-center justify-center gap-2.5 ${className}`}>
      {Array.from({ length: 17 }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rotate-45 bg-current opacity-30" />
      ))}
    </span>
  );
}

/** Photo aux coins très arrondis (arche) avec repli dégradé sans image. */
function ArchImage({
  url,
  alt,
  arch = "tl",
  className = "",
}: {
  url?: string;
  alt: string;
  arch?: "tl" | "top";
  className?: string;
}) {
  const radius =
    arch === "top"
      ? "rounded-[var(--r-xl)] rounded-t-[var(--r-arch)]"
      : "rounded-[var(--r-xl)] lg:rounded-tl-[var(--r-arch)]";
  if (!url) {
    return (
      <div
        aria-hidden
        className={`${radius} bg-gradient-to-br from-[var(--site-soft)] via-[var(--site-soft)] to-[var(--site-primary)]/30 ${className}`}
      />
    );
  }
  return <img src={url} alt={alt} className={`${radius} object-cover ${className}`} />;
}

/** Bouton téléphone en pilule contour. */
function PhoneButton({ phone, onDark = false }: { phone: string; onDark?: boolean }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      className={
        onDark
          ? "inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] border border-current/40 px-7 py-3.5 text-[1.05rem] font-medium transition-opacity hover:opacity-80"
          : "inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] border border-[var(--site-primary)]/50 px-7 py-3.5 text-[1.05rem] font-medium text-[var(--site-primary)] transition-colors hover:bg-[var(--site-soft)]"
      }
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      Appeler au {phone}
    </a>
  );
}

/**
 * Bibliothèque d'icônes des encarts (points forts, infos pratiques, badges).
 * Les noms viennent de SECTION_ICONS (packages/shared) ; repli : cœur.
 */
const ICON_PATHS: Record<string, ReactNode> = {
  medaille: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9.5 13.5 8 21l4-2 4 2-1.5-7.5" strokeLinejoin="round" />
      <path d="m12 6.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.7l2-.3z" fill="currentColor" stroke="none" />
    </>
  ),
  diplome: (
    <>
      <path d="M2.5 9.5 12 4.5l9.5 5L12 14.5z" strokeLinejoin="round" />
      <path d="M6.5 12v4.5c0 1 2.5 2.5 5.5 2.5s5.5-1.5 5.5-2.5V12M21.5 9.5V15" strokeLinecap="round" />
    </>
  ),
  coeur: (
    <path d="M12 20.5C6.5 16.5 3.5 13 3.5 9.5 3.5 7 5.5 5 8 5c1.6 0 3.1.9 4 2.2C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.5 0 3.5-3 7-8.5 11z" strokeLinejoin="round" />
  ),
  mains: (
    <>
      <path d="M12 12.5c-3-2.5-4.8-4.4-4.8-6.3C7.2 4.9 8.3 4 9.5 4c1 0 1.9.5 2.5 1.3C12.6 4.5 13.5 4 14.5 4c1.2 0 2.3.9 2.3 2.2 0 1.9-1.8 3.8-4.8 6.3z" strokeLinejoin="round" />
      <path d="M4 15.5c2-1.5 4-1.5 5.5-.5l2.5 1.5c.8.5.8 1.7-.3 2l-3.2.8M20 15.5c-2-1.5-4-1.5-5.5-.5l-.8.5" strokeLinecap="round" />
      <path d="M2.5 14.5 6 19.5M21.5 14.5 18 19.5" strokeLinecap="round" />
    </>
  ),
  fleur: (
    <>
      <path d="M12 20c0-4 0-6.5 0-6.5M12 13.5c-2.8 0-5-2.2-5-5V6c2.8 0 5 2.2 5 5m0 2.5c2.8 0 5-2.2 5-5V6c-2.8 0-5 2.2-5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11V4.5" strokeLinecap="round" />
    </>
  ),
  feuille: (
    <path d="M6 18C6 10 11 5 19 5c0 8-5 13-13 13zm0 0c0-4 2-7 5-9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  soleil: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" strokeLinecap="round" />
    </>
  ),
  etoile: (
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" strokeLinejoin="round" />
  ),
  carte: (
    <>
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" strokeLinejoin="round" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  colonne: (
    <>
      <rect x="9.2" y="2.8" width="5.6" height="3.6" rx="1.5" />
      <rect x="9.2" y="7.8" width="5.6" height="3.6" rx="1.5" />
      <rect x="9.2" y="12.8" width="5.6" height="3.6" rx="1.5" />
      <rect x="9.2" y="17.8" width="5.6" height="3.6" rx="1.5" />
    </>
  ),
  bebe: (
    <>
      <circle cx="12" cy="8.5" r="4.5" />
      <path d="M12 4c.2-1.2 1-2 2.1-2" strokeLinecap="round" />
      <path d="M5.5 21c.7-4.4 3.2-6.8 6.5-6.8s5.8 2.4 6.5 6.8" strokeLinecap="round" />
    </>
  ),
  lune: <path d="M19.5 14.5A8.5 8.5 0 1 1 9.5 4.5a7 7 0 0 0 10 10z" strokeLinejoin="round" />,
  eclair: <path d="M13.5 2.5 5.5 13.5h5l-1 8 8-11h-5z" strokeLinejoin="round" />,
  tete: (
    <>
      <path
        d="M9.5 21v-3.1a7.5 7.5 0 1 1 9.4-8.3c.2 1.3-.1 2.6-.8 3.7-.3.4-.3.9-.2 1.3l.7 1.8c.2.6-.2 1.2-.9 1.2h-1.2v.9c0 1.1-.9 2-2 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.8 9.6c.8-.7 1.7-.7 2.5 0" strokeLinecap="round" />
    </>
  ),
  maison: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  calendrier: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" strokeLinecap="round" />
      <path d="M8 14h2M14 14h2M8 17h2" strokeLinecap="round" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  euro: (
    <>
      <path d="M17.5 6.5A7 7 0 0 0 12 4.5c-3.6 0-6.5 3.4-6.5 7.5s2.9 7.5 6.5 7.5a7 7 0 0 0 5.5-2" strokeLinecap="round" />
      <path d="M3.5 10.5h9M3.5 13.5h8" strokeLinecap="round" />
    </>
  ),
  document: (
    <>
      <path d="M6 3.5h9l3 3v14l-2-1-2 1-2-1-2 1-2-1-2 1z" strokeLinejoin="round" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" strokeLinecap="round" />
    </>
  ),
  bouclier: (
    <>
      <path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" strokeLinejoin="round" />
      <path d="m8.8 11.8 2.2 2.2 4.2-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  personnes: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3.5 20c.5-3.5 2.7-5.5 5.5-5.5s5 2 5.5 5.5" strokeLinecap="round" />
      <path d="M15.5 5.5a3.5 3.5 0 0 1 0 6M17.5 14.8c1.7.8 2.7 2.6 3 5.2" strokeLinecap="round" />
    </>
  ),
};

/** Icône d'encart par nom (repli : cœur si le nom est inconnu). */
function SectionIcon({
  name,
  size = 28,
  strokeWidth = 1.6,
}: {
  name?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden>
      {ICON_PATHS[name ?? ""] ?? ICON_PATHS.coeur}
    </svg>
  );
}

/** Rendu inline léger des textes générés : **gras** (jamais de HTML libre). */
function Rich({ text }: { text: string }) {
  // Quantificateur paresseux : le contenu peut contenir un « * » isolé
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Badge chiffré flottant sur la photo du hero (« +300 / Patients accompagnés »). */
function StatBadge({ stat }: { stat: { icon?: string; value: string; label: string } }) {
  return (
    <span className="flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--site-deep)]/90 px-5 py-3 text-[var(--site-on-deep)] shadow-xl shadow-black/25 backdrop-blur-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--site-on-deep)] text-[var(--site-deep)]">
        <SectionIcon name={stat.icon} size={24} />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-tight">{stat.value}</span>
        <span className="block text-xs opacity-85">{stat.label}</span>
      </span>
    </span>
  );
}

/** Lien vers la fiche sur Google Maps (place_id quand une fiche est reliée). */
function googleMapsUrl(ctx: SectionContext, address: string | null): string | null {
  if (!address) return null;
  const query = `${ctx.googleBusinessName ?? ctx.site.name}, ${address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${
    ctx.googlePlaceId ? `&query_place_id=${encodeURIComponent(ctx.googlePlaceId)}` : ""
  }`;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function Hero({ section, ctx }: { section: Extract<Section, { type: "hero" }>; ctx: SectionContext }) {
  const showRating =
    section.showGoogleRating && ctx.googleRating !== null && ctx.googleRating > 0;
  const cardAddress = ctx.googleAddress ?? ctx.address ?? null;
  const mapsUrl = googleMapsUrl(ctx, cardAddress);

  const cardInner = (
    <>
      {ctx.googlePhotoUrl ? (
        <img
          src={ctx.googlePhotoUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {ctx.googleBusinessName ?? ctx.site.name}
        </span>
        {cardAddress ? (
          <span className="block max-w-56 truncate text-xs opacity-70">{cardAddress}</span>
        ) : null}
        {showRating ? (
          <span className="flex items-center gap-1.5 text-xs">
            <GoogleStars rating={ctx.googleRating!} />
            <span className="opacity-70">
              {ctx.googleReviewCount ? `${ctx.googleReviewCount} avis Google` : "Avis Google"}
            </span>
          </span>
        ) : null}
      </span>
      {showRating ? <GoogleG className="ml-1 h-5 w-5 shrink-0" /> : null}
    </>
  );
  const googleCard = mapsUrl ? (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Voir la fiche sur Google Maps"
      className="mt-8 inline-flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--site-surface)] px-5 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {cardInner}
    </a>
  ) : (
    <div className="mt-8 inline-flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--site-surface)] px-5 py-3 shadow-sm">
      {cardInner}
    </div>
  );

  const content = (
    <>
      {section.badge ? <Pill>{section.badge}</Pill> : null}
      <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.06] text-[var(--site-primary-dark)] sm:text-[4.3rem]">
        {section.title}
      </h1>
      <div className="mt-7 max-w-xl space-y-4 text-xl opacity-85">
        {section.paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            <Rich text={p} />
          </p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} label={section.ctaLabel} />
        {ctx.phone ? <PhoneButton phone={ctx.phone} /> : null}
      </div>
      {googleCard}
    </>
  );

  const stats = section.stats ?? [];

  // Sans photo : mise en page d'origine avec panneau dégradé
  if (!section.imageUrl) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="hy-rise">{content}</div>
          <div className="relative">
            <ArchImage url={undefined} alt="" className="h-full max-h-[30rem] min-h-[20rem] w-full lg:min-h-[26rem]" />
            {stats[0] ? (
              <div className="hy-rise absolute left-4 top-6">
                <StatBadge stat={stats[0]} />
              </div>
            ) : null}
            {stats[1] ? (
              <div className="hy-rise absolute bottom-6 right-4" style={{ animationDelay: "0.25s" }}>
                <StatBadge stat={stats[1]} />
              </div>
            ) : null}
          </div>
        </div>
        <DotsRow className="pb-10 text-[var(--site-primary)] lg:pb-12" />
      </section>
    );
  }

  // Avec photo : hero cinématique — image pleine hauteur fondue dans le fond
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="glow h-[26rem] w-[26rem] opacity-50"
        style={{
          right: "-4rem",
          top: "-6rem",
          background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 16%, transparent), transparent 70%)",
        }}
      />
      <div aria-hidden className="absolute inset-y-0 left-0 hidden w-[47%] overflow-hidden lg:block">
        <img
          src={section.imageUrl}
          alt=""
          className="hy-kenburns h-full w-full object-cover"
          style={{
            maskImage:
              "linear-gradient(to right, black 72%, transparent 99%), linear-gradient(to bottom, black 88%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 72%, transparent 99%), linear-gradient(to bottom, black 88%, transparent 100%)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        />
      </div>
      <div className="relative lg:hidden">
        <img
          src={section.imageUrl}
          alt=""
          className="max-h-[44vh] w-full object-cover object-top"
          style={{
            maskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
          }}
        />
        {stats[0] ? (
          <div className="hy-rise absolute left-4 top-4">
            <StatBadge stat={stats[0]} />
          </div>
        ) : null}
      </div>
      {stats.length > 0 ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[47%] lg:block">
          {stats[0] ? (
            <div className="hy-rise absolute left-10 top-12">
              <StatBadge stat={stats[0]} />
            </div>
          ) : null}
          {stats[1] ? (
            <div className="hy-rise absolute bottom-14 right-6" style={{ animationDelay: "0.25s" }}>
              <StatBadge stat={stats[1]} />
            </div>
          ) : null}
          {stats[2] ? (
            <div className="hy-rise absolute bottom-14 left-10" style={{ animationDelay: "0.4s" }}>
              <StatBadge stat={stats[2]} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="relative mx-auto flex max-w-7xl px-4 pb-14 pt-2 lg:min-h-[40rem] lg:items-center lg:justify-end lg:py-24">
        <div className="hy-rise lg:w-[57%] lg:pl-8">{content}</div>
      </div>
      <DotsRow className="pb-10 text-[var(--site-primary)] lg:pb-12" />
    </section>
  );
}

/** Bandeau de points forts sur fond coloré, entre le hero et les spécialités. */
function Highlights({ section }: { section: Extract<Section, { type: "highlights" }> }) {
  if (section.items.length === 0) return null;
  const cols =
    section.items.length >= 4
      ? "lg:grid-cols-4"
      : section.items.length === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-2";
  return (
    <section
      className="relative overflow-hidden pb-14 pt-24 lg:pb-16"
      style={{
        background: "linear-gradient(to bottom, var(--site-bg), var(--site-primary) 2.5rem)",
      }}
    >
      <div aria-hidden className="wave-bg-light absolute inset-0" />
      <div className={`relative mx-auto grid max-w-7xl gap-7 px-4 sm:grid-cols-2 ${cols}`}>
        {section.items.map((item, i) => (
          <div
            key={i}
            style={{ transitionDelay: `${Math.min(i, 5) * 80}ms` }}
            className="reveal flex flex-col items-center justify-center rounded-[var(--r-md)] bg-[var(--site-bg)] px-7 py-10 text-center text-[var(--site-text)] shadow-lg shadow-black/15"
          >
            <span className="flex h-14 w-14 items-center justify-center text-[var(--site-primary)]">
              <SectionIcon name={item.icon} size={46} strokeWidth={1.9} />
            </span>
            <h3 className="mt-4 text-[1.55rem] font-bold leading-snug">{item.title}</h3>
            {item.text ? (
              <p className="mt-2.5 text-[1.08rem] leading-relaxed opacity-75">
                <Rich text={item.text} />
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Specialties({
  section,
  ctx,
}: {
  section: Extract<Section, { type: "specialties" }>;
  ctx: SectionContext;
}) {
  // Toutes les spécialités restent affichées quelle que soit la formule ;
  // seules les cartes dont la page secondaire est accessible sont cliquables
  // (Starter : cartes simples, sans lien « En savoir plus »).
  const items = section.items;
  const isLinked = (slug: string) =>
    !ctx.allowedMotifSlugs || ctx.allowedMotifSlugs.includes(slug);
  if (items.length === 0) return null;
  return (
    <section
      id="specialites"
      className="fade-deep-both relative scroll-mt-20 py-20 text-[var(--site-on-deep)] lg:py-24"
    >
      <div aria-hidden className="wave-bg-light stage-light absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-4">
        <div className="reveal text-center">
          <Pill onDark>Motifs de consultation</Pill>
          <h2 className="mx-auto mt-5 max-w-2xl text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">
            {section.title}
          </h2>
          <DotsRow className="mt-6" />
          {section.intro ? (
            <p className="mx-auto mt-5 max-w-2xl text-xl opacity-80">{section.intro}</p>
          ) : null}
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const inner = (
              <>
                <span
                  aria-hidden
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--site-soft)] text-[var(--site-primary)]"
                >
                  <SectionIcon name={item.icon ?? specialtyIconFor(item.title, index)} size={32} />
                </span>
                <h3 className="mt-6 text-2xl font-semibold group-hover:text-[var(--site-primary)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[1.05rem] leading-relaxed opacity-75">
                  <Rich text={item.excerpt} />
                </p>
              </>
            );
            const cardClass =
              "reveal group rounded-[var(--r-lg)] bg-[var(--site-bg)] p-10 text-[var(--site-text)] shadow-lg shadow-black/10";
            const delay = { transitionDelay: `${Math.min(index, 5) * 70}ms` };
            return isLinked(item.slug) ? (
              <Link
                key={item.slug}
                href={`${ctx.prefix}/motifs/${item.slug}`}
                style={delay}
                className={`${cardClass} transition-transform hover:-translate-y-1`}
              >
                {inner}
                <span className="mt-6 inline-block text-[1.05rem] font-medium text-[var(--site-primary)]">
                  En savoir plus →
                </span>
              </Link>
            ) : (
              <div key={item.slug} style={delay} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
        </div>
      </div>
    </section>
  );
}

/** Projection positive : bénéfices ✅ à gauche, photo de séance fondue à droite. */
function Future({ section, ctx }: { section: Extract<Section, { type: "future" }>; ctx: SectionContext }) {
  return (
    <section className="relative scroll-mt-20 overflow-hidden">
      <div
        aria-hidden
        className="glow h-80 w-80 opacity-40"
        style={{
          left: "-5rem",
          bottom: "-4rem",
          background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 18%, transparent), transparent 70%)",
        }}
      />
      {section.imageUrl ? (
        <>
          <div className="relative lg:hidden">
            <img
              src={section.imageUrl}
              alt=""
              className="max-h-[44vh] w-full object-cover"
              style={{
                maskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
              }}
            />
          </div>
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[44%] overflow-hidden lg:block">
            <img
              src={section.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{
                maskImage:
                  "linear-gradient(to left, black 72%, transparent 99%), linear-gradient(to bottom, black 90%, transparent 100%), linear-gradient(to top, black 90%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to left, black 72%, transparent 99%), linear-gradient(to bottom, black 90%, transparent 100%), linear-gradient(to top, black 90%, transparent 100%)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />
          </div>
        </>
      ) : null}
      <div className="relative mx-auto flex max-w-7xl px-4 py-12 lg:min-h-[42rem] lg:items-center lg:py-24">
        <div className="reveal lg:w-[55%] lg:pr-8">
          {section.badge ? <Pill>{section.badge}</Pill> : null}
          <h2 className="mt-5 text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">
            {section.title}
          </h2>
          {section.intro ? (
            <p className="mt-6 text-xl opacity-85">
              <Rich text={section.intro} />
            </p>
          ) : null}
          <ul className="mt-6 space-y-3.5">
            {section.bullets.map((bullet, i) => (
              <li
                key={i}
                style={{ transitionDelay: `${Math.min(i, 5) * 70}ms` }}
                className="reveal flex items-start gap-2.5 text-[1.1rem] leading-relaxed"
              >
                <span aria-hidden className="mt-0.5 shrink-0">
                  ✅
                </span>
                <span className="whitespace-pre-line opacity-90">
                  <Rich text={bullet} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} label={section.ctaLabel} />
          </div>
        </div>
      </div>
    </section>
  );
}

function About({ section, ctx }: { section: Extract<Section, { type: "about" }>; ctx: SectionContext }) {
  // Avec photo : portrait plein hauteur fondu à gauche (comme le hero)
  if (section.imageUrl) {
    return (
      <section id="a-propos" className="wave-bg relative scroll-mt-20 overflow-hidden">
        <div
          aria-hidden
          className="glow h-96 w-96 opacity-50"
          style={{
            right: "-6rem",
            top: "10%",
            background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 22%, transparent), transparent 70%)",
          }}
        />
        <div className="relative lg:hidden">
          <img
            src={section.imageUrl}
            alt=""
            className="max-h-[44vh] w-full object-cover object-top"
            style={{
              maskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 82%, transparent 100%)",
            }}
          />
        </div>
        <div aria-hidden className="absolute inset-y-0 left-0 hidden w-[44%] overflow-hidden lg:block">
          <img
            src={section.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{
              maskImage:
                "linear-gradient(to right, black 72%, transparent 99%), linear-gradient(to bottom, black 90%, transparent 100%), linear-gradient(to top, black 90%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, black 72%, transparent 99%), linear-gradient(to bottom, black 90%, transparent 100%), linear-gradient(to top, black 90%, transparent 100%)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          />
        </div>
        <div className="relative mx-auto flex max-w-7xl px-4 py-12 lg:min-h-[42rem] lg:items-center lg:justify-end lg:py-24">
          <div className="reveal lg:w-[55%] lg:pl-8">
            <Pill>Votre praticien·ne</Pill>
            <h2 className="mt-5 text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
            <div className="mt-7 space-y-4 text-xl opacity-85">
              {section.paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line leading-relaxed">
                  <Rich text={p} />
                </p>
              ))}
            </div>
            {section.infoCards && section.infoCards.length > 0 ? (
              <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.infoCards.map((card, i) => (
                  <div
                    key={i}
                    style={{ transitionDelay: `${Math.min(i, 4) * 80}ms` }}
                    className="reveal rounded-[var(--r-md)] bg-[var(--site-soft)]/60 p-6 text-center"
                  >
                    <span className="mx-auto flex h-11 w-11 items-center justify-center text-[var(--site-primary)]">
                      <SectionIcon name={card.icon} size={30} />
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold">{card.title}</h3>
                    <p className="mt-1.5 whitespace-pre-line text-[0.95rem] leading-relaxed opacity-80">
                      <Rich text={card.text} />
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
              {ctx.phone ? <PhoneButton phone={ctx.phone} /> : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Sans photo : mise en page d'origine avec panneau dégradé
  return (
    <section id="a-propos" className="wave-bg relative scroll-mt-20 overflow-hidden py-20 lg:py-24">
      <div
        aria-hidden
        className="glow h-96 w-96 opacity-50"
        style={{
          right: "-6rem",
          top: "10%",
          background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 22%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="reveal">
          <Pill>Votre praticien·ne</Pill>
          <h2 className="mt-5 text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
          <div className="mt-7 space-y-4 text-xl opacity-85">
            {section.paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line leading-relaxed">
                <Rich text={p} />
              </p>
            ))}
          </div>
          {section.infoCards && section.infoCards.length > 0 ? (
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.infoCards.map((card, i) => (
                <div
                  key={i}
                  style={{ transitionDelay: `${Math.min(i, 4) * 80}ms` }}
                  className="reveal rounded-[var(--r-md)] bg-[var(--site-soft)]/60 p-6 text-center"
                >
                  <span className="mx-auto flex h-11 w-11 items-center justify-center text-[var(--site-primary)]">
                    <SectionIcon name={card.icon} size={30} />
                  </span>
                  <h3 className="mt-2.5 text-lg font-bold">{card.title}</h3>
                  <p className="mt-1.5 whitespace-pre-line text-[0.95rem] leading-relaxed opacity-80">
                    <Rich text={card.text} />
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
            {ctx.phone ? <PhoneButton phone={ctx.phone} /> : null}
          </div>
        </div>
        <div className="reveal" style={{ transitionDelay: "120ms" }}>
          <ArchImage url={section.imageUrl} alt="" arch="top" className="mx-auto aspect-[4/5] w-full max-w-[28rem]" />
        </div>
      </div>
    </section>
  );
}

function Reviews({
  section,
  ctx,
}: {
  section: Extract<Section, { type: "reviews" }>;
  ctx: SectionContext;
}) {
  if (ctx.reviews.length === 0) return null;
  const businessName = ctx.googleBusinessName ?? ctx.site.name;
  const now = new Date();
  const cards = ctx.reviews.slice(0, 8).map((review) => ({
    id: review.id,
    authorName: review.authorName,
    authorPhotoUrl: review.authorPhotoUrl,
    rating: review.rating,
    dateLabel: review.reviewedAt ? reviewDateFr(review.reviewedAt, now) : null,
    text: review.text,
  }));
  return (
    <section id="avis" className="relative scroll-mt-20 overflow-hidden py-20">
      <div
        aria-hidden
        className="glow h-80 w-[36rem] opacity-40"
        style={{
          left: "20%",
          bottom: "-8rem",
          background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 18%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4">
        <div className="grid items-start gap-6 lg:grid-cols-[19rem_1fr]">
          <div className="reveal rounded-[var(--r-lg)] bg-[var(--site-surface)] p-7 shadow-sm">
            <div className="flex items-center gap-3.5">
              {ctx.googlePhotoUrl ? (
                <img
                  src={ctx.googlePhotoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 shrink-0 rounded-full object-cover shadow-sm"
                />
              ) : null}
              <p className="text-lg font-semibold leading-snug">{businessName}</p>
            </div>
            {ctx.googleRating ? (
              <>
                <p className="mt-3 flex items-center gap-2">
                  <span className="text-4xl font-bold">{ctx.googleRating}</span>
                  <GoogleStars rating={ctx.googleRating} className="text-[1.2rem]" />
                </p>
                <p className="mt-1 text-sm opacity-70">
                  {ctx.googleReviewCount ? `${ctx.googleReviewCount} avis Google` : "Avis Google"}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm opacity-70">{section.title}</p>
            )}
            {ctx.googlePlaceId ? (
              <a
                href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(ctx.googlePlaceId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-[var(--r-pill)] border border-current/25 px-5 py-2 text-sm font-medium transition hover:bg-[var(--site-soft)]"
              >
                Écrire un avis
              </a>
            ) : null}
            {section.intro ? <p className="mt-4 text-sm opacity-75">{section.intro}</p> : null}
          </div>
          <div className="reveal min-w-0">
            <GoogleReviewsCarousel reviews={cards} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Process({ section, ctx }: { section: Extract<Section, { type: "process" }>; ctx: SectionContext }) {
  return (
    <section id="deroulement" className="fade-soft relative scroll-mt-20 py-20 lg:py-24">
      <div aria-hidden className="wave-bg absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-4">
        <div className="reveal text-center">
          <Pill>À quoi s&apos;attendre ?</Pill>
          <h2 className="mx-auto mt-5 max-w-2xl text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
          <DotsRow className="mt-6 text-[var(--site-primary)]" />
        </div>
        <ol className="mt-14 grid gap-7 sm:grid-cols-2">
          {section.steps.map((step, i) => (
            <li
              key={i}
              className="reveal flex overflow-hidden rounded-[var(--r-lg)] border border-[var(--site-primary)]/30 bg-[var(--site-surface)]/70"
              style={{ transitionDelay: `${Math.min(i, 3) * 90}ms` }}
            >
              <span
                aria-hidden
                className="flex w-28 shrink-0 items-center justify-center border-r border-[var(--site-primary)]/30 text-8xl font-semibold text-[var(--site-primary)]"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                {i + 1}
              </span>
              <span className="p-8">
                <h3 className="text-2xl font-semibold">{step.title}</h3>
                <p className="mt-3 whitespace-pre-line text-[1.05rem] leading-relaxed opacity-80">
                  <Rich text={step.description} />
                </p>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-14 text-center">
          <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
        </div>
      </div>
    </section>
  );
}

function Faq({ section, ctx }: { section: Extract<Section, { type: "faq" }>; ctx: SectionContext }) {
  return (
    <section id="questions" className="scroll-mt-20 py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="reveal">
          <Pill>Vos questions</Pill>
          <h2 className="mt-5 text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
          <p className="mt-4 opacity-75">
            Une autre question ? Le plus simple est d&apos;en parler directement.
          </p>
          <div className="mt-6">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
          </div>
        </div>
        <div className="space-y-3">
          {section.items.map((item, i) => (
            <details
              key={i}
              style={{ transitionDelay: `${Math.min(i, 5) * 60}ms` }}
              className="reveal group overflow-hidden rounded-[var(--r-md)] open:bg-[var(--site-surface)] open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--site-primary)] px-7 py-6 text-lg font-medium text-white transition-colors group-open:rounded-b-none group-open:bg-[var(--site-soft)] group-open:text-[var(--site-text)] hover:bg-[var(--site-primary-dark)] group-open:hover:bg-[var(--site-soft)]">
                {item.question}
                <span aria-hidden className="shrink-0 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="whitespace-pre-line px-7 py-6 text-[1.05rem] leading-relaxed opacity-80">
                <Rich text={item.answer} />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact({
  section,
  ctx,
}: {
  section: Extract<Section, { type: "contact" }>;
  ctx: SectionContext;
}) {
  // Fiche Google reliée → carte et lien centrés sur la fiche ; sinon l'adresse
  const address = ctx.googleAddress ?? section.address ?? null;
  const placeName = ctx.googleBusinessName ?? ctx.site.name;
  const mapQuery = address ? `${placeName}, ${address}` : null;
  const mapsUrl = googleMapsUrl(ctx, address);

  return (
    <section
      id="contact"
      className="fade-deep-top relative scroll-mt-20 py-20 text-[var(--site-on-deep)] lg:py-24"
    >
      <div aria-hidden className="wave-bg-light stage-light absolute inset-0" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="reveal">
          {mapQuery ? (
            <iframe
              title="Carte d'accès au cabinet"
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=14&hl=fr&output=embed`}
              className="h-64 w-full rounded-[var(--r-lg)] border-0 bg-white/5 sm:h-72"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : null}
          <DotsRow className="mt-9 justify-start! text-[var(--site-primary)]" />
          <p className="mt-9 text-2xl font-semibold">Le cabinet</p>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full max-w-md items-center gap-4 rounded-[var(--r-lg)] bg-[var(--site-surface)] p-4 pr-6 text-[var(--site-text)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {ctx.googlePhotoUrl ? (
                <img
                  src={ctx.googlePhotoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 shrink-0 rounded-[var(--r-md)] object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--site-soft)] text-[var(--site-primary-dark)]"
                >
                  <SectionIcon name="carte" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--site-primary-dark)]">{placeName}</span>
                {address ? <span className="mt-0.5 block text-sm opacity-75">{address}</span> : null}
                <span className="mt-1 block text-xs font-medium text-[var(--site-primary)]">
                  Voir sur Google Maps ↗
                </span>
              </span>
            </a>
          ) : null}
        </div>
        <div className="reveal" style={{ transitionDelay: "120ms" }}>
          <h2 className="text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
          <p className="mt-4 text-lg opacity-85">Prendre rendez-vous en ligne ou par téléphone :</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
            {section.phone ? <PhoneButton phone={section.phone} onDark /> : null}
          </div>
          {section.email || section.hours?.length || section.note ? (
            <div className="mt-6 space-y-1.5 text-[0.95rem] opacity-80">
              {section.email ? (
                <p>
                  <a href={`mailto:${section.email}`} className="underline">
                    {section.email}
                  </a>
                </p>
              ) : null}
              {section.hours?.map((h) => (
                <p key={h.label}>
                  {h.label} : {h.value}
                </p>
              ))}
              {section.note ? <p>{section.note}</p> : null}
            </div>
          ) : null}
          {section.infoCards?.length ? (
            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              {section.infoCards.map((card, i) => (
                <div
                  key={i}
                  className="rounded-[var(--r-lg)] bg-[var(--site-surface)] p-7 text-center text-[var(--site-text)] shadow-sm"
                >
                  <span className="inline-flex text-[var(--site-primary-dark)]">
                    <SectionIcon name={card.icon} size={34} />
                  </span>
                  <p className="mt-3 text-xl font-semibold">{card.title}</p>
                  <p className="mt-1.5 text-sm opacity-75">{card.text}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RichText({ section }: { section: Extract<Section, { type: "richText" }> }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      {section.title ? <h2 className="mb-4 text-3xl font-semibold">{section.title}</h2> : null}
      <Markdown content={section.body} />
    </section>
  );
}

function Cta({ section, ctx }: { section: Extract<Section, { type: "cta" }>; ctx: SectionContext }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14">
      <div className="reveal wave-bg-light rounded-[var(--r-xl)] bg-[var(--site-primary)] px-8 py-16 text-center text-white shadow-xl shadow-black/10">
        <h2 className="mx-auto max-w-2xl text-[2.2rem] font-semibold leading-[1.15] sm:text-[2.6rem]">{section.title}</h2>
        {section.body ? (
          <p className="mx-auto mt-5 max-w-2xl whitespace-pre-line text-xl opacity-90">
            <Rich text={section.body} />
          </p>
        ) : null}
        <div className="mt-9">
          <RdvButton
            siteId={ctx.site.id}
            bookingUrl={ctx.site.bookingUrl}
            label={section.buttonLabel}
            className="inline-flex items-center justify-center rounded-[var(--r-pill)] bg-white px-8 py-3.5 text-[1.05rem] font-medium text-[var(--site-primary)] transition-opacity hover:opacity-90"
          />
        </div>
      </div>
    </section>
  );
}
