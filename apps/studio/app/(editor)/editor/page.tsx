import type { Section } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getEditablePages, getProspect, getSite, siteUrl } from "@/lib/data";
import { SiteEditor } from "./site-editor";

export const metadata = { title: "Éditer votre site" };
export const dynamic = "force-dynamic";
// La régénération d'une page de spécialité (action serveur) peut prendre ~1 min
export const maxDuration = 300;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function EditorPage({ searchParams }: Props) {
  const session = await requireClient();
  const { page: pageParam } = await searchParams;

  const site = await getSite(session.siteId);
  const [pages, prospect] = await Promise.all([getEditablePages(site.id), getProspect(site)]);
  const selected = pages.find((p) => p.id === pageParam) ?? pages.find((p) => p.type === "home") ?? pages[0];

  // Numéro affiché sur le site (source : section contact de l'accueil)
  const homeContact = pages
    .find((p) => p.type === "home")
    ?.sections.find((s): s is Extract<Section, { type: "contact" }> => s.type === "contact");

  return (
    <SiteEditor
      // Remonte l'éditeur quand on change de page : sans ça, l'état `sections`
      // de l'ancienne page survit à la navigation ?page=… et peut être publié
      // sur la nouvelle (les pages motifs partagent la même structure).
      key={selected?.id ?? "aucune"}
      site={{
        id: site.id,
        name: site.name,
        bookingUrl: site.bookingUrl ?? "",
        themePreset: site.theme.preset,
        fontPreset: site.theme.fontPreset,
        intensity: site.theme.intensity ?? "naturel",
        corners: site.theme.corners ?? "rond",
        ambiance: site.theme.ambiance ?? "naturel",
        logoUrl: site.theme.logoUrl ?? "",
        url: siteUrl(site),
        updatedAt: site.updatedAt.toISOString(),
      }}
      city={prospect?.city ?? ""}
      phone={homeContact?.phone ?? ""}
      googleBusiness={
        prospect?.googlePlaceId
          ? {
              name: prospect.googleBusinessName ?? "Fiche Google",
              address: prospect.googleAddress ?? "",
              rating: prospect.googleRating,
              reviewCount: prospect.googleReviewCount,
            }
          : null
      }
      pages={pages.map((p) => ({
        id: p.id,
        type: p.type,
        slug: p.slug,
        title: p.type === "home" ? "Page d'accueil" : p.title,
      }))}
      selectedPage={
        selected
          ? { id: selected.id, type: selected.type, slug: selected.slug, sections: selected.sections }
          : null
      }
    />
  );
}
