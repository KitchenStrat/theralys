import Link from "next/link";
import type { GoogleReview, Site } from "@theralys/db";
import type { Section } from "@theralys/shared";
import { Markdown } from "./markdown";
import { RdvButton } from "./rdv-button";

export type SectionContext = {
  site: Site;
  prefix: string;
  reviews: GoogleReview[];
  googleRating: number | null;
  googleReviewCount: number | null;
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
    case "specialties":
      return <Specialties section={section} ctx={ctx} />;
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

/** Avatar rond avec l'initiale (preuve sociale, avis). */
function AvatarInitial({ name, className = "h-10 w-10 text-base" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--site-soft)] font-semibold text-[var(--site-primary)] ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-label={`${rating} étoiles sur 5`} className={`text-[var(--site-primary)] ${className}`}>
      {"★".repeat(Math.min(full, 5))}
      <span className="opacity-25">{"★".repeat(Math.max(5 - full, 0))}</span>
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
      {phone}
    </a>
  );
}

/** Rendu inline léger des textes générés : **gras** (jamais de HTML libre). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
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

// ─── Sections ────────────────────────────────────────────────────────────────

function Hero({ section, ctx }: { section: Extract<Section, { type: "hero" }>; ctx: SectionContext }) {
  const showRating =
    section.showGoogleRating && ctx.googleRating !== null && ctx.googleRating > 0;

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
      <div className="mt-8 inline-flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--site-surface)] px-4 py-3 shadow-sm">
        <AvatarInitial name={ctx.site.name} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{ctx.site.name}</span>
          {ctx.address ? (
            <span className="block max-w-56 truncate text-xs opacity-70">{ctx.address}</span>
          ) : null}
          {showRating ? (
            <span className="flex items-center gap-1.5 text-xs">
              <Stars rating={ctx.googleRating!} />
              <span className="opacity-70">
                {ctx.googleReviewCount ? `${ctx.googleReviewCount} avis Google` : "Avis Google"}
              </span>
            </span>
          ) : null}
        </span>
      </div>
    </>
  );

  // Sans photo : mise en page d'origine avec panneau dégradé
  if (!section.imageUrl) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="hy-rise">{content}</div>
          <ArchImage url={undefined} alt="" className="h-full max-h-[30rem] min-h-[20rem] w-full lg:min-h-[26rem]" />
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
            maskImage: "linear-gradient(to right, black 55%, transparent 97%)",
            WebkitMaskImage: "linear-gradient(to right, black 55%, transparent 97%)",
          }}
        />
      </div>
      <img
        src={section.imageUrl}
        alt=""
        className="max-h-[44vh] w-full object-cover object-top lg:hidden"
        style={{
          maskImage: "linear-gradient(to bottom, black 68%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 68%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto flex max-w-7xl px-4 pb-14 pt-2 lg:min-h-[40rem] lg:items-center lg:justify-end lg:py-24">
        <div className="hy-rise lg:w-[57%] lg:pl-8">{content}</div>
      </div>
      <DotsRow className="pb-10 text-[var(--site-primary)] lg:pb-12" />
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
  const items = ctx.allowedMotifSlugs
    ? section.items.filter((item) => ctx.allowedMotifSlugs!.includes(item.slug))
    : section.items;
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
          {items.map((item, index) => (
            <Link
              key={item.slug}
              href={`${ctx.prefix}/motifs/${item.slug}`}
              style={{ transitionDelay: `${Math.min(index, 5) * 70}ms` }}
              className="reveal group rounded-[var(--r-lg)] bg-[var(--site-bg)] p-10 text-[var(--site-text)] shadow-lg shadow-black/10 transition-transform hover:-translate-y-1"
            >
              <span
                aria-hidden
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--site-soft)] text-[var(--site-primary)]"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 21c-4-2.5-6.5-5.5-6.5-9A6.5 6.5 0 0 1 12 5.5 6.5 6.5 0 0 1 18.5 12c0 3.5-2.5 6.5-6.5 9z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path d="M12 5.5V3M8.5 6.5 7 4.5M15.5 6.5 17 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <h3 className="mt-6 text-2xl font-semibold group-hover:text-[var(--site-primary)]">
                {item.title}
              </h3>
              <p className="mt-3 text-[1.05rem] leading-relaxed opacity-75">
                <Rich text={item.excerpt} />
              </p>
              <span className="mt-6 inline-block text-[1.05rem] font-medium text-[var(--site-primary)]">
                En savoir plus →
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-12 text-center">
          <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
        </div>
      </div>
    </section>
  );
}

function About({ section, ctx }: { section: Extract<Section, { type: "about" }>; ctx: SectionContext }) {
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
          <div className="mt-8 flex flex-wrap items-center gap-3">
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
          <div className="reveal rounded-[var(--r-lg)] bg-[var(--site-surface)] p-8 shadow-sm">
            <AvatarInitial name={ctx.site.name} className="h-14 w-14 text-xl" />
            <p className="mt-3 text-lg font-semibold">{ctx.site.name}</p>
            {ctx.googleRating ? (
              <>
                <p className="mt-1 flex items-center gap-2">
                  <span className="text-4xl font-bold">{ctx.googleRating}</span>
                  <Stars rating={ctx.googleRating} />
                </p>
                <p className="mt-1 text-sm opacity-70">
                  {ctx.googleReviewCount ? `${ctx.googleReviewCount} avis Google` : "Avis Google"}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm opacity-70">{section.title}</p>
            )}
            {section.intro ? <p className="mt-3 text-sm opacity-75">{section.intro}</p> : null}
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto pb-3">
            {ctx.reviews.slice(0, 8).map((review, index) => (
              <figure
                key={review.id}
                style={{ transitionDelay: `${Math.min(index, 4) * 80}ms` }}
                className="reveal w-[24rem] shrink-0 snap-start rounded-[var(--r-lg)] bg-[var(--site-surface)] p-8 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <AvatarInitial name={review.authorName} className="h-11 w-11 text-base" />
                  <figcaption className="min-w-0">
                    <span className="block truncate font-semibold">{review.authorName}</span>
                    <span className="block text-xs opacity-60">Avis Google</span>
                  </figcaption>
                </div>
                <Stars rating={review.rating} className="mt-3 block" />
                <blockquote className="mt-3 line-clamp-6 text-[1.05rem] leading-relaxed opacity-85">
                  {review.text}
                </blockquote>
              </figure>
            ))}
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
  return (
    <section
      id="contact"
      className="fade-deep-top relative scroll-mt-20 py-20 text-[var(--site-on-deep)] lg:py-24"
    >
      <div aria-hidden className="wave-bg-light stage-light absolute inset-0" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="reveal">
          <h2 className="text-[2.6rem] font-semibold leading-[1.08] sm:text-[3.4rem]">{section.title}</h2>
          <p className="mt-5 text-xl opacity-80">Prenez rendez-vous en ligne ou par téléphone.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
            {section.phone ? <PhoneButton phone={section.phone} onDark /> : null}
          </div>
        </div>
        <div className="reveal rounded-[var(--r-lg)] bg-white/5 p-9" style={{ transitionDelay: "120ms" }}>
          <div className="flex items-center gap-3">
            <AvatarInitial name={ctx.site.name} className="h-12 w-12 text-lg" />
            <span className="text-lg font-semibold">{ctx.site.name}</span>
          </div>
          <div className="mt-5 space-y-2 text-[1.05rem] opacity-85">
            {section.address ? <p>{section.address}</p> : null}
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
            {section.note ? <p className="pt-1 opacity-75">{section.note}</p> : null}
          </div>
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
