import { ExternalLink, Globe, PencilLine, Settings2 } from "lucide-react";
import Link from "next/link";
import { Card, IconBadge, LinkButton } from "@/components/ds";

type Props = {
  /**
   * Le site de référence des outils : `hosted`, le site Harmony (accès à son
   * éditeur) ; `external`, le site du praticien (accès à « Mon site »).
   */
  reference: "hosted" | "external";
  /** Adresse du site de référence, telle qu'on la lit (« www.mon-cabinet.fr ») */
  address: string;
  /** Adresse complète, pour « Voir mon site » */
  viewHref: string;
  /** L'action de la carte est le bouton principal de l'écran (aucune « prochaine étape » au-dessus) */
  emphasis: boolean;
};

/**
 * Carte « Votre site » : le site de référence et la façon de le modifier. Site
 * Harmony : accès à l'éditeur (ici et dans « Mon site », pas dans la
 * navigation) ; site du praticien : accès à « Mon site », plus d'éditeur.
 */
export function SiteCard({ reference, address, viewHref, emphasis }: Props) {
  const main = emphasis ? "primary" : "secondary";
  const external = reference === "external";
  return (
    <Card variant="tinted" section="mon-site" data-testid="site-card" data-reference={reference}>
      <div className="flex items-start gap-3.5">
        <IconBadge icon={Globe} size="md" />
        {/* `min-w-0` : une adresse longue passe à la ligne, elle n'élargit jamais la carte */}
        <div className="min-w-0">
          <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">Votre site</h2>
          {external ? (
            <p className="text-ds-body font-medium wrap-anywhere text-ds-ink-900" data-testid="site-card-url">
              {address}
            </p>
          ) : (
            <p className="text-ds-body font-medium wrap-anywhere text-ds-ink-900">{address}</p>
          )}
        </div>
      </div>

      {external ? (
        <p className="mt-3.5 text-base text-ds-ink-700">Vos outils s&apos;appuient sur votre site&nbsp;: contenus, liens et statistiques.</p>
      ) : (
        <>
          <p className="mt-3.5 text-base text-ds-ink-700">
            Textes, photos, horaires, tarifs&nbsp;: modifiez votre site en quelques clics, c&apos;est en ligne immédiatement.
          </p>
          <p className="mt-2 text-ds-body">
            <Link
              href="/mon-site"
              data-testid="site-card-connect-link"
              className="inline-flex min-h-6 items-center rounded font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus pointer-coarse:min-h-11"
            >
              Vous avez déjà un site&nbsp;?
            </Link>
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2.5">
        {external ? (
          <LinkButton href="/mon-site" variant={main} data-testid="site-card-manage" icon={<Settings2 size={18} aria-hidden />}>
            Gérer mon site
          </LinkButton>
        ) : (
          <LinkButton href="/editor" variant={main} icon={<PencilLine size={18} aria-hidden />}>
            Éditer mon site
          </LinkButton>
        )}
        <LinkButton
          href={viewHref}
          external
          variant="quiet"
          data-testid={external ? "site-card-view" : undefined}
          icon={<ExternalLink size={18} aria-hidden />}
        >
          Voir mon site
        </LinkButton>
      </div>
    </Card>
  );
}
