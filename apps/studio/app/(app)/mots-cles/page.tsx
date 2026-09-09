import { hasKeywordResearch, hasSearchConsole } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import {
  getEditablePages,
  getGoogleConnection,
  getGoogleVisibility,
  getProspect,
  getSite,
} from "@/lib/data";
import { GoogleVisibilityCard } from "../google-visibility-card";
import { KeywordResearchCard } from "./keyword-research";

export const metadata = { title: "Mots-clés" };
export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const [prospect, pages, connection] = await Promise.all([
    getProspect(site),
    getEditablePages(site.id),
    getGoogleConnection(site.id),
  ]);
  // Les démos présentent l'offre complète ; les clients suivent leur formule
  const gscAccess = site.type === "demo" || hasSearchConsole(site.plan);
  const researchAccess = site.type === "demo" || hasKeywordResearch(site.plan);
  const visibility = gscAccess && connection ? await getGoogleVisibility(site.id) : null;
  const specialties = pages.filter((p) => p.type === "motif").map((p) => p.title);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Mots-clés</h1>

      <GoogleVisibilityCard
        gscAccess={gscAccess}
        connected={Boolean(connection)}
        visibility={visibility}
      />

      {researchAccess ? (
        <KeywordResearchCard
          defaultProfession={prospect?.profession ?? ""}
          defaultCity={prospect?.city ?? ""}
          defaultSpecialties={specialties.join(", ")}
        />
      ) : (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Recherche de mots-clés</h2>
          <p className="mt-3 text-base text-ink-500">
            L&apos;outil de recherche des mots-clés SEO est disponible avec la formule{" "}
            <strong>Scale</strong> — il propose 15 expressions à cibler à partir de votre
            métier, votre ville et vos spécialités.
          </p>
        </Card>
      )}
    </div>
  );
}
