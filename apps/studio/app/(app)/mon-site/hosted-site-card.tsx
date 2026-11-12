import Link from "next/link";
import { Card } from "@theralys/ui";
import { siteAddressLabel } from "@/lib/external-site/format";
import { PILL_PRIMARY, PILL_SECONDARY } from "./styles";

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

export function HostedSiteCard({ url, role }: { url: string; role: HostedSiteRole }) {
  return (
    <section aria-labelledby="hosted-site-title" data-testid="hosted-site-card" data-role={role}>
      <Card className="p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-xl">
            <h2 id="hosted-site-title" className="text-xl font-semibold">
              Votre site Harmony
            </h2>
            <p className="mt-1 wrap-anywhere text-base font-medium text-ink-900" data-testid="hosted-site-url">
              {siteAddressLabel(url)}
            </p>
            <p className="mt-2 text-base text-ink-700">{ROLE_TEXT[role]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/editor" className={role === "reference" ? PILL_PRIMARY : PILL_SECONDARY} data-testid="hosted-site-edit">
              <span aria-hidden>✎</span> Éditer mon site Harmony
            </Link>
            <a href={url} target="_blank" rel="noopener noreferrer" className={PILL_SECONDARY} data-testid="hosted-site-view">
              <span aria-hidden>↗</span> Voir<span className="sr-only"> mon site Harmony (nouvel onglet)</span>
            </a>
          </div>
        </div>
      </Card>
    </section>
  );
}
