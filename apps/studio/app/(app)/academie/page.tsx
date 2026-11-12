import { ArrowRight, GraduationCap, HeartHandshake, Lock, MessageCircle, Search, type LucideIcon } from "lucide-react";
import { hasAcademy } from "@theralys/db";
import { Card, EmptyState, IconBadge, LinkButton, PageHeader, Stagger, StatusPill } from "@/components/ds";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";

export const metadata = { title: "Académie" };
export const dynamic = "force-dynamic";

/** Les trois thèmes annoncés pour les formations — rien de plus n'est promis ici. */
const THEMES: { label: string; icon: LucideIcon }[] = [
  { label: "Visibilité", icon: Search },
  { label: "Fidélisation", icon: HeartHandshake },
  { label: "Communication", icon: MessageCircle },
];

export default async function AcademyPage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  // Les démos présentent l'offre complète ; les clients suivent leur formule
  const access = site.type === "demo" || hasAcademy(site.plan);

  if (!access) {
    return (
      <Stagger className="space-y-6">
        <PageHeader section="academie" />
        <Card padding="none">
          <EmptyState
            icon={Lock}
            as="h2"
            title="L'Académie n'est pas incluse dans votre formule"
            action={
              <LinkButton href="/compte" iconRight={<ArrowRight size={18} aria-hidden />}>
                Voir ma formule
              </LinkButton>
            }
          >
            Passez à la formule <strong className="font-semibold text-ds-ink-900">Scale</strong> pour accéder aux formations —
            visibilité, fidélisation, communication — en plus du blog et des outils de mots-clés.
          </EmptyState>
        </Card>
      </Stagger>
    );
  }

  return (
    <Stagger className="space-y-6">
      <PageHeader section="academie" />

      <Card padding="none">
        <EmptyState
          icon={GraduationCap}
          as="h2"
          title="Vos formations se préparent"
          secondary={
            <LinkButton href="/" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />}>
              Retour à l&apos;accueil
            </LinkButton>
          }
        >
          Des formations pour développer votre cabinet arrivent dans cet espace. Vous n&apos;avez rien à faire : elles
          apparaîtront ici dès qu&apos;elles seront prêtes.
        </EmptyState>
      </Card>

      <section aria-labelledby="academie-programme">
        <h2 id="academie-programme" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
          Au programme
        </h2>
        <p className="mt-1 text-ds-body text-ds-ink-600">Trois thèmes pour développer votre cabinet.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {THEMES.map((theme) => (
            <Card as="li" key={theme.label} className="flex items-center gap-3.5 p-4 sm:flex-col sm:items-start sm:p-5">
              <IconBadge icon={theme.icon} size="md" />
              <div className="min-w-0">
                <h3 className="font-ds-display text-lg/7 font-bold text-ds-ink-900">{theme.label}</h3>
                <StatusPill status="en-cours" className="mt-1.5" />
              </div>
            </Card>
          ))}
        </ul>
      </section>
    </Stagger>
  );
}
