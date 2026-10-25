import { PLANS, motifPagesAllowance } from "@theralys/db";
import {
  DEFAULT_NOT_FOUND,
  signSitePreviewToken,
  type GeneratingMotif,
  type Section,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getEditablePages, getProspect, getSite, siteUrl } from "@/lib/data";
import { SiteEditor } from "./site-editor";

export const metadata = { title: "Éditer votre site" };
export const dynamic = "force-dynamic";
// La régénération d'une page de spécialité (action serveur) peut prendre ~1 min
export const maxDuration = 300;

type Props = { searchParams: Promise<{ page?: string; section?: string; surface?: string; tab?: string }> };

export default async function EditorPage({ searchParams }: Props) {
  const session = await requireClient();
  const { page: pageParam } = await searchParams;

  const site = await getSite(session.siteId);
  const [allPages, prospect] = await Promise.all([getEditablePages(site.id), getProspect(site)]);
  // Jeton signé pour l'aperçu : le site public affiche la démo même expirée et
  // les pages désactivées à l'éditeur seul (vérifié par le middleware des sites)
  const previewToken = process.env.AUTH_SECRET
    ? await signSitePreviewToken({ siteId: site.id }, process.env.AUTH_SECRET)
    : "";
  // Les pages de spécialités suivent la formule (Starter : aucune page dédiée
  // publique — on ne propose donc pas de les éditer) ; les démos, en formule
  // complète, gardent les leurs. Les pages en cours de génération (créées
  // depuis le studio, `sections: []`) sont toujours listées.
  const generatingMotifs: GeneratingMotif[] = (site.theme.generatingMotifs ?? []).map((g) => ({
    slug: g.slug,
    subject: g.subject,
    startedAt: g.startedAt,
    ...(g.error ? { error: g.error } : {}),
  }));
  const generatingSlugs = new Set(generatingMotifs.map((g) => g.slug));
  const allowedMotifIds = new Set(
    allPages
      .filter((p) => p.type === "motif")
      .filter((p, i) => i < motifPagesAllowance(site.plan) || generatingSlugs.has(p.slug))
      .map((p) => p.id),
  );
  const pages = allPages.filter((p) => p.type !== "motif" || allowedMotifIds.has(p.id));
  const selected = pages.find((p) => p.id === pageParam) ?? pages.find((p) => p.type === "home") ?? pages[0];

  // Numéro affiché sur le site (source : section contact de l'accueil)
  const homePage = pages.find((p) => p.type === "home");
  const homeContact = homePage?.sections.find(
    (s): s is Extract<Section, { type: "contact" }> => s.type === "contact",
  );
  // Aperçu du lien : titre/description Google de l'accueil + photo du hero (repli d'image)
  const homeHero = homePage?.sections.find(
    (s): s is Extract<Section, { type: "hero" }> => s.type === "hero",
  );
  // Cartes de la section Spécialités de l'accueil (emplacements disponibles pour une nouvelle page)
  const homeSpecialties = homePage?.sections.find(
    (s): s is Extract<Section, { type: "specialties" }> => s.type === "specialties",
  );
  const theme = site.theme;
  const notFound = {
    title: theme.notFound?.title || DEFAULT_NOT_FOUND.title,
    message: theme.notFound?.message ?? DEFAULT_NOT_FOUND.message,
    buttonLabel: theme.notFound?.buttonLabel || DEFAULT_NOT_FOUND.buttonLabel,
    showSpecialties: theme.notFound?.showSpecialties ?? DEFAULT_NOT_FOUND.showSpecialties,
  };

  return (
    <SiteEditor
      // Remonte l'éditeur quand on change de page : sans ça, l'état `sections`
      // de l'ancienne page survit à la navigation ?page=… et peut être publié
      // sur la nouvelle (les pages motifs partagent la même structure).
      key={selected?.id ?? "aucune"}
      site={{
        id: site.id,
        name: site.name,
        plan: site.plan,
        bookingUrl: site.bookingUrl ?? "",
        themePreset: site.theme.preset,
        fontPreset: site.theme.fontPreset,
        intensity: site.theme.intensity ?? "naturel",
        corners: site.theme.corners ?? "rond",
        ambiance: site.theme.ambiance ?? "naturel",
        logoUrl: site.theme.logoUrl ?? "",
        palette: site.theme.palette,
        url: siteUrl(site),
        updatedAt: site.updatedAt.toISOString(),
        disabledMotifs: site.theme.disabledMotifs ?? [],
        cabinets: site.theme.cabinets ?? [],
        faviconUrl: site.theme.faviconUrl ?? "",
        shareImageUrl: site.theme.shareImageUrl ?? "",
        previewToken,
        generatingMotifs,
      }}
      city={prospect?.city ?? ""}
      phone={homeContact?.phone ?? ""}
      seo={{
        title: homePage?.metaTitle ?? site.name,
        description: homePage?.metaDescription ?? "",
        heroImageUrl: homeHero?.imageUrl ?? "",
      }}
      tracking={{
        cookieBanner: site.theme.tracking?.cookieBanner !== false,
        googleAnalyticsId: site.theme.tracking?.googleAnalyticsId ?? "",
        googleTagManagerId: site.theme.tracking?.googleTagManagerId ?? "",
        googleAdsId: site.theme.tracking?.googleAdsId ?? "",
        metaPixelId: site.theme.tracking?.metaPixelId ?? "",
      }}
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
      googleConnected={Boolean(prospect?.googlePlaceId)}
      homePageId={homePage?.id ?? null}
      homeSpecialtiesCount={homeSpecialties?.items.length ?? 0}
      homeSpecialtiesMax={PLANS[site.plan].homeSpecialties}
      notFound={notFound}
      legal={{
        legalForm: theme.legal?.legalForm ?? "",
        siret: theme.legal?.siret ?? "",
        registration: theme.legal?.registration ?? "",
        email: theme.legal?.email ?? "",
        mediatorName: theme.legal?.mediatorName ?? "",
        mediatorUrl: theme.legal?.mediatorUrl ?? "",
        extra: theme.legal?.extra ?? "",
      }}
      social={{
        instagram: theme.social?.instagram ?? "",
        facebook: theme.social?.facebook ?? "",
        linkedin: theme.social?.linkedin ?? "",
        tiktok: theme.social?.tiktok ?? "",
        youtube: theme.social?.youtube ?? "",
      }}
      footer={{ text: theme.footer?.text ?? "", details: theme.footer?.details ?? "" }}
      pages={pages.map((p) => ({
        id: p.id,
        type: p.type,
        slug: p.slug,
        title: p.type === "home" ? "Page d'accueil" : p.title,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
      }))}
      selectedPage={
        selected
          ? {
              id: selected.id,
              type: selected.type,
              slug: selected.slug,
              sections: selected.sections,
              generating:
                selected.type === "motif" &&
                generatingMotifs.some((g) => g.slug === selected.slug && !g.error),
            }
          : null
      }
    />
  );
}
