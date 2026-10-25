import Link from "next/link";
import type { Page, Site } from "@theralys/db";
import { FOOTER_SOCIAL_NETWORKS, LEGAL_PAGES, type SiteSocialLinks } from "@theralys/shared";
import { cabinetAddressLine, cabinetMapsUrl, visibleCabinets } from "@/lib/cabinets";
import { hasBlogAccess } from "@/lib/site-data";
import { ManageCookiesButton } from "./manage-cookies-button";

export type FooterGoogleBusiness = {
  name: string | null;
  address: string | null;
  placeId: string | null;
};

/** Pictogrammes des réseaux sociaux (traits simples, `currentColor`). */
const SOCIAL_ICON_SVG: Record<keyof SiteSocialLinks, string> = {
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />',
  facebook:
    '<path d="M14 8.5V6.8c0-.8.5-1.3 1.3-1.3H17V2.5h-2.5C11.8 2.5 10.5 4.2 10.5 6.6v1.9H8V12h2.5v9.5H14V12h2.6l.4-3.5z" stroke-linejoin="round" />',
  linkedin:
    '<rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M7.5 10.5v6M7.5 7.6v.1M11.5 16.5v-6M11.5 13.3c0-1.6 1.1-2.8 2.5-2.8s2.5 1.2 2.5 2.8v3.2" stroke-linecap="round" />',
  tiktok:
    '<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3" stroke-linecap="round" /><path d="M14 3c.3 2.8 2.2 4.6 5 4.8" stroke-linecap="round" />',
  youtube:
    '<rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />',
};

function isPublicUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());
}

/**
 * Pied de page du template : trois colonnes (praticien, cabinets, liens) sur
 * desktop, une seule sur mobile ; réseaux sociaux ; informations
 * complémentaires (SIRET, diplômes…) ; mention « Site créé avec Harmony ».
 * Toutes les données sont passées depuis le layout (aucune requête ici).
 */
export function SiteFooter({
  site,
  prefix,
  motifPages,
  google,
  phone,
}: {
  site: Site;
  prefix: string;
  /** Pages de spécialité activées (liens de la colonne Liens) */
  motifPages: Pick<Page, "id" | "slug" | "title">[];
  /** Fiche Google reliée (cabinet principal) */
  google: FooterGoogleBusiness | null;
  /** Téléphone de la section Contact de l'accueil */
  phone: string | null;
}) {
  const home = `${prefix}`;
  const footer = site.theme.footer ?? {};
  const text = footer.text?.trim();
  const details = footer.details?.trim();
  const cabinets = visibleCabinets(site.theme);
  const social = FOOTER_SOCIAL_NETWORKS.filter((n) => isPublicUrl(site.theme.social?.[n.key]));
  const googleName = google?.name?.trim() || null;
  const googleAddress = google?.address?.trim() || null;
  const googleMapsUrl = googleAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${googleName ?? site.name}, ${googleAddress}`)}${
        google?.placeId ? `&query_place_id=${encodeURIComponent(google.placeId)}` : ""
      }`
    : null;
  const hasCabinets = Boolean(googleAddress) || cabinets.length > 0 || Boolean(phone);
  const cookieBanner = site.theme.tracking?.cookieBanner !== false;

  const columnTitle = "text-[0.8rem] font-semibold uppercase tracking-wider opacity-60";
  const link = "transition-opacity hover:opacity-100 opacity-85";

  return (
    <footer className="border-t border-white/10 bg-[var(--site-deep)] pb-8 pt-14 text-[var(--site-on-deep)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-12 md:grid-cols-3 md:gap-10">
          {/* Praticien */}
          <div>
            <p className="text-2xl font-semibold leading-tight" style={{ fontFamily: "var(--site-font-heading)" }}>
              {site.name}
            </p>
            {text ? <p className="mt-4 text-[0.95rem] leading-relaxed opacity-85">{text}</p> : null}
            <p className="mt-4 text-sm leading-relaxed opacity-60">
              Ce site présente une activité de bien-être qui ne se substitue ni à un avis médical ni à
              un suivi par un professionnel de santé.
            </p>
            {social.length > 0 ? (
              <ul className="mt-6 flex flex-wrap items-center gap-2" aria-label="Réseaux sociaux">
                {social.map((network) => (
                  <li key={network.key}>
                    <a
                      href={site.theme.social![network.key]!.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={network.label}
                      title={network.label}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-current/25 opacity-85 transition hover:bg-white/10 hover:opacity-100"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden
                      >
                        <g dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_SVG[network.key] }} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Cabinets */}
          {hasCabinets ? (
            <div>
              <p className={columnTitle}>{cabinets.length + (googleAddress ? 1 : 0) > 1 ? "Les cabinets" : "Le cabinet"}</p>
              <ul className="mt-4 space-y-4 text-[0.95rem]">
                {googleAddress ? (
                  <li>
                    <span className="block font-semibold">{googleName ?? site.name}</span>
                    {googleMapsUrl ? (
                      <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className={`${link} mt-0.5 block`}>
                        {googleAddress}
                      </a>
                    ) : (
                      <span className="mt-0.5 block opacity-85">{googleAddress}</span>
                    )}
                  </li>
                ) : null}
                {cabinets.map((cabinet, i) => (
                  <li key={i}>
                    <span className="block font-semibold">{cabinet.name}</span>
                    <a href={cabinetMapsUrl(cabinet)} target="_blank" rel="noopener noreferrer" className={`${link} mt-0.5 block`}>
                      {cabinetAddressLine(cabinet)}
                    </a>
                  </li>
                ))}
                {phone ? (
                  <li>
                    <a href={`tel:${phone.replace(/\s/g, "")}`} className={`${link} inline-flex items-center gap-2 font-medium`}>
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
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <div aria-hidden className="hidden md:block" />
          )}

          {/* Liens */}
          <div>
            <p className={columnTitle}>Liens</p>
            <ul className="mt-4 space-y-2 text-[0.95rem]">
              <li>
                <Link href={home} className={link}>
                  Accueil
                </Link>
              </li>
              {motifPages.map((page) => (
                <li key={page.id}>
                  <Link href={`${prefix}/motifs/${page.slug}`} className={link}>
                    {page.title}
                  </Link>
                </li>
              ))}
              {hasBlogAccess(site) ? (
                <li>
                  <Link href={`${prefix}/blog`} className={link}>
                    Blog
                  </Link>
                </li>
              ) : null}
            </ul>
            <ul className="mt-5 space-y-2 border-t border-white/10 pt-5 text-sm">
              {LEGAL_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link href={`${prefix}/${page.slug}`} className={link}>
                    {page.title}
                  </Link>
                </li>
              ))}
              {cookieBanner ? (
                <li>
                  <ManageCookiesButton className={`${link} underline decoration-current/40 underline-offset-2`} />
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-sm opacity-70">
          {details ? <p className="mb-3 leading-relaxed">{details}</p> : null}
          <p>
            © {new Date().getFullYear()} {site.name} · Site créé avec{" "}
            <a
              href="https://harmony-web.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-100"
            >
              Harmony
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
