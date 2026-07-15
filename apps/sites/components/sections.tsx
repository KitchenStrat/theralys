import Link from "next/link";
import type { GoogleReview, Site } from "@theralys/db";
import type { Section } from "@theralys/shared";
import { GoogleRatingBadge } from "./google-rating-badge";
import { Markdown } from "./markdown";
import { RdvButton } from "./rdv-button";

export type SectionContext = {
  site: Site;
  prefix: string;
  reviews: GoogleReview[];
  googleRating: number | null;
  googleReviewCount: number | null;
};

/** Rendu d'une liste de sections typées (contenu structuré, jamais de HTML libre). */
export function Sections({ sections, ctx }: { sections: Section[]; ctx: SectionContext }) {
  return (
    <>
      {sections.map((section, i) => (
        <SectionRenderer key={`${section.type}-${i}`} section={section} ctx={ctx} />
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
      return <About section={section} />;
    case "reviews":
      return <Reviews section={section} ctx={ctx} />;
    case "process":
      return <Process section={section} />;
    case "faq":
      return <Faq section={section} />;
    case "contact":
      return <Contact section={section} ctx={ctx} />;
    case "richText":
      return <RichText section={section} />;
    case "cta":
      return <Cta section={section} ctx={ctx} />;
  }
}

function Hero({ section, ctx }: { section: Extract<Section, { type: "hero" }>; ctx: SectionContext }) {
  const showRating =
    section.showGoogleRating && ctx.googleRating !== null && ctx.googleRating > 0;
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          {section.badge ? (
            <span className="inline-block rounded-full border border-[var(--site-primary)]/40 px-4 py-1.5 text-sm text-[var(--site-primary)]">
              {section.badge}
            </span>
          ) : null}
          <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">{section.title}</h1>
          <div className="mt-6 space-y-4 text-lg opacity-85">
            {section.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-8">
            <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} label={section.ctaLabel} />
          </div>
        </div>
        <div className="relative min-h-64">
          <div
            aria-hidden
            className="h-full min-h-64 w-full rounded-3xl bg-gradient-to-br from-[var(--site-soft)] via-[var(--site-soft)] to-[var(--site-primary)]/30"
          />
          {showRating ? (
            <div className="absolute left-4 top-6">
              <GoogleRatingBadge rating={ctx.googleRating!} />
            </div>
          ) : null}
        </div>
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
  return (
    <section id="specialites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
      <h2 className="text-3xl font-bold">{section.title}</h2>
      {section.intro ? <p className="mt-3 max-w-2xl opacity-80">{section.intro}</p> : null}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((item) => (
          <Link
            key={item.slug}
            href={`${ctx.prefix}/motifs/${item.slug}`}
            className="group rounded-3xl border border-black/5 bg-[var(--site-surface)] p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="text-lg font-semibold group-hover:text-[var(--site-primary)]">
              {item.title}
            </h3>
            <p className="mt-2 text-sm opacity-75">{item.excerpt}</p>
            <span className="mt-4 inline-block text-sm font-medium text-[var(--site-primary)]">
              Découvrir →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function About({ section }: { section: Extract<Section, { type: "about" }> }) {
  return (
    <section id="a-propos" className="scroll-mt-20 bg-[var(--site-soft)]/40 py-14">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold">{section.title}</h2>
        <div className="mt-6 space-y-4 text-lg opacity-85">
          {section.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
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
    <section id="avis" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{section.title}</h2>
          {section.intro ? <p className="mt-2 opacity-75">{section.intro}</p> : null}
        </div>
        {ctx.googleRating ? (
          <p className="text-sm opacity-70">
            Note Google : <strong>{ctx.googleRating}/5</strong>
            {ctx.googleReviewCount ? ` · ${ctx.googleReviewCount} avis` : null}
          </p>
        ) : null}
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {ctx.reviews.slice(0, 6).map((review) => (
          <figure
            key={review.id}
            className="rounded-3xl border border-black/5 bg-[var(--site-surface)] p-6 shadow-sm"
          >
            <div aria-label={`${review.rating} étoiles sur 5`} className="text-[var(--site-primary)]">
              {"★".repeat(review.rating)}
              <span className="opacity-25">{"★".repeat(5 - review.rating)}</span>
            </div>
            <blockquote className="mt-3 text-sm opacity-85">{review.text}</blockquote>
            <figcaption className="mt-4 text-sm font-semibold">{review.authorName}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Process({ section }: { section: Extract<Section, { type: "process" }> }) {
  return (
    <section id="deroulement" className="scroll-mt-20 bg-[var(--site-soft)]/40 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-bold">{section.title}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {section.steps.map((step, i) => (
            <li
              key={i}
              className="rounded-3xl border border-black/5 bg-[var(--site-surface)] p-6 shadow-sm"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--site-soft)] font-bold text-[var(--site-primary)]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm opacity-75">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq({ section }: { section: Extract<Section, { type: "faq" }> }) {
  return (
    <section id="questions" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14">
      <h2 className="text-3xl font-bold">{section.title}</h2>
      <div className="mt-6 space-y-3">
        {section.items.map((item, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-black/5 bg-[var(--site-surface)] px-5 py-4 shadow-sm"
          >
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="flex items-center justify-between gap-3">
                {item.question}
                <span aria-hidden className="text-[var(--site-primary)] transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm opacity-80">{item.answer}</p>
          </details>
        ))}
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
    <section id="contact" className="scroll-mt-20 bg-[var(--site-soft)]/40 py-14">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl font-bold">{section.title}</h2>
        <div className="mt-5 space-y-1 opacity-85">
          {section.address ? <p>{section.address}</p> : null}
          {section.phone ? (
            <p>
              <a href={`tel:${section.phone.replace(/\s/g, "")}`} className="underline">
                {section.phone}
              </a>
            </p>
          ) : null}
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
          {section.note ? <p className="text-sm opacity-75">{section.note}</p> : null}
        </div>
        <div className="mt-7">
          <RdvButton siteId={ctx.site.id} bookingUrl={ctx.site.bookingUrl} />
        </div>
      </div>
    </section>
  );
}

function RichText({ section }: { section: Extract<Section, { type: "richText" }> }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      {section.title ? <h2 className="mb-4 text-3xl font-bold">{section.title}</h2> : null}
      <Markdown content={section.body} />
    </section>
  );
}

function Cta({ section, ctx }: { section: Extract<Section, { type: "cta" }>; ctx: SectionContext }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-3xl bg-[var(--site-primary)] px-8 py-10 text-center text-white">
        <h2 className="text-2xl font-bold">{section.title}</h2>
        {section.body ? <p className="mt-3 opacity-90">{section.body}</p> : null}
        <div className="mt-6">
          <RdvButton
            siteId={ctx.site.id}
            bookingUrl={ctx.site.bookingUrl}
            label={section.buttonLabel}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-medium text-[var(--site-primary)] transition-opacity hover:opacity-90"
          />
        </div>
      </div>
    </section>
  );
}
