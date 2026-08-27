import { hasSearchConsole } from "@theralys/db";
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
  const gscAccess = hasSearchConsole(site.plan);
  const visibility = gscAccess && connection ? await getGoogleVisibility(site.id) : null;
  const specialties = pages.filter((p) => p.type === "motif").map((p) => p.title);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mots-clés</h1>

      <GoogleVisibilityCard
        gscAccess={gscAccess}
        connected={Boolean(connection)}
        visibility={visibility}
      />

      <KeywordResearchCard
        defaultProfession={prospect?.profession ?? ""}
        defaultCity={prospect?.city ?? ""}
        defaultSpecialties={specialties.join(", ")}
      />
    </div>
  );
}
