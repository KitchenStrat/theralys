import { CircleCheck, ExternalLink, Eye, EyeOff, LayoutTemplate, PenLine, type LucideIcon } from "lucide-react";
import { Badge, Card, IconBadge, LinkButton, type BadgeTone } from "@/components/ds";
import { frenchSpacing, siteAddressLabel } from "@/lib/external-site/format";
import { BADGE_WRAP, CARD_TITLE } from "./styles";
import { CardHead } from "./ui";

/**
 * « Votre site Harmony » : le site inclus dans la formule, avec les accès
 * pour le voir et le modifier. `role` dit sa place du moment :
 * - `reference` : les outils s'appuient sur lui (aucun autre site actif) ;
 * - `hidden` : le site du praticien est la référence, celui-ci reste en ligne
 *   mais masqué des moteurs de recherche ;
 * - `visible` : idem, gardé visible à la demande du praticien.
 */
export type HostedSiteRole = "reference" | "hidden" | "visible";

const ROLE_TEXT: Record<HostedSiteRole, string> = {
  reference: "C'est le site inclus dans votre formule. Aujourd'hui, vos outils s'appuient sur lui : contenus, liens et statistiques.",
  hidden: "Il reste en ligne à cette adresse et vous pouvez toujours le modifier. Il est masqué des moteurs de recherche, pour ne pas faire concurrence à votre site.",
  visible: "Il reste en ligne à cette adresse et vous pouvez toujours le modifier. Comme vous l'avez demandé, il reste aussi visible sur Google.",
};

/** Sa place du moment, en un mot et une icône (la phrase en dessous la détaille). */
const ROLE_BADGE: Record<HostedSiteRole, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  reference: { tone: "success", icon: CircleCheck, label: "Utilisé par vos outils" },
  hidden: { tone: "neutral", icon: EyeOff, label: "Masqué des moteurs de recherche" },
  visible: { tone: "brand", icon: Eye, label: "En ligne, visible sur Google" },
};

export function HostedSiteCard({ url, role, className }: { url: string; role: HostedSiteRole; className?: string }) {
  const badge = ROLE_BADGE[role];
  return (
    <section aria-labelledby="hosted-site-title" className={className} data-testid="hosted-site-card" data-role={role}>
      <Card padding="lg" className="h-full">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
          <CardHead
            className="max-w-2xl flex-[1_1_20rem]"
            icon={<IconBadge icon={LayoutTemplate} tone="soft" size="md" />}
            title={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 id="hosted-site-title" className={CARD_TITLE}>
                  Votre site Harmony
                </h2>
                <Badge tone={badge.tone} icon={badge.icon} className={BADGE_WRAP}>
                  {badge.label}
                </Badge>
              </div>
            }
          >
            <p className="wrap-anywhere text-base font-semibold text-ds-ink-900" data-testid="hosted-site-url">
              {siteAddressLabel(url)}
            </p>
            <p className="mt-1.5 text-base text-ds-ink-700">{frenchSpacing(ROLE_TEXT[role])}</p>
          </CardHead>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <LinkButton href="/editor" variant="secondary" icon={<PenLine size={18} aria-hidden />} data-testid="hosted-site-edit">
              Éditer mon site Harmony
            </LinkButton>
            <LinkButton href={url} external variant="quiet" icon={<ExternalLink size={18} aria-hidden />} data-testid="hosted-site-view">
              Voir<span className="sr-only"> mon site Harmony</span>
            </LinkButton>
          </div>
        </div>
      </Card>
    </section>
  );
}
