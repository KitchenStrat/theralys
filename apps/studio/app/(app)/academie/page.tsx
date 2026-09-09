import { hasAcademy } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";

export const metadata = { title: "Académie" };
export const dynamic = "force-dynamic";

export default async function AcademyPage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  // Les démos présentent l'offre complète ; les clients suivent leur formule
  const access = site.type === "demo" || hasAcademy(site.plan);

  if (!access) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">Académie</h1>
        <Card className="p-10 text-center text-ink-500">
          <span aria-hidden className="text-4xl">
            🎓
          </span>
          <p className="mt-4 font-medium text-ink-700">
            L&apos;Académie n&apos;est pas incluse dans votre formule
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm">
            Passez à la formule <strong>Scale</strong> pour accéder aux formations —
            visibilité, fidélisation, communication — en plus du blog SEO et des outils de
            mots-clés.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Académie</h1>
      <Card className="p-12 text-center">
        <span aria-hidden className="text-4xl">
          🎓
        </span>
        <p className="mt-4 text-lg font-semibold text-ink-900">En construction</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Des formations complètes pour développer votre cabinet — visibilité,
          fidélisation, communication — arrivent bientôt dans cet espace.
        </p>
      </Card>
    </div>
  );
}
