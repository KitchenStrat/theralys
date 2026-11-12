import { ArrowRight, ChartLine } from "lucide-react";
import { LinkButton } from "@/components/ds";

/**
 * À la place des chiffres quand le site du praticien est la référence des
 * outils et que son code de mesure n'a encore envoyé aucune visite : plutôt
 * que des tuiles à zéro et une courbe vide, l'état dit pourquoi et mène à
 * l'installation. Une seule action. La mise en forme est celle de l'état vide
 * teinté du design system (`EmptyState`), composée ici pour garder le titre et
 * son `id` tels quels.
 */
export function AwaitingMeasure({ address }: { address: string }) {
  return (
    <section
      aria-labelledby="awaiting-measure-title"
      data-testid="stats-awaiting-measure"
      data-ds-section="mon-site"
      className="flex flex-col items-center rounded-ds-card bg-ds-section-soft px-5 py-9 text-center ring-1 ring-ds-section-line/70 sm:px-8 sm:py-11"
    >
      <span aria-hidden className="relative grid size-28 place-items-center">
        <span className="absolute inset-0 rounded-full bg-ds-section-tint-2/70" />
        <span className="absolute inset-3.5 rounded-full bg-white ring-1 ring-ds-section-line" />
        <span className="absolute top-1.5 right-3 size-3 rounded-full bg-ds-sun-400" />
        <span className="absolute bottom-3 left-1.5 size-2 rounded-full bg-ds-section-from" />
        <span className="relative grid size-14 place-items-center rounded-ds-md bg-ds-section-gradient text-ds-section-on shadow-ds-glow">
          <ChartLine size={28} strokeWidth={2} />
        </span>
      </span>
      <h2 id="awaiting-measure-title" className="mt-5 max-w-lg font-ds-display text-xl/7 font-bold text-balance text-ds-section-ink">
        Les visites de votre site ne sont pas encore mesurées
      </h2>
      <p className="mt-2 max-w-xl text-base text-pretty text-ds-ink-700">
        Vos outils s&apos;appuient maintenant sur <span className="font-medium wrap-anywhere text-ds-ink-900">{address}</span>. Pour suivre ici
        ses visiteurs, leur provenance et les clics sur vos liens de rendez-vous, installez le code de mesure sur votre site&nbsp;: quelques
        minutes suffisent.
      </p>
      {/* Bouton secondaire : dans cet état, l'action principale de l'écran est la « prochaine étape » du bandeau, qui mène au même endroit */}
      <LinkButton
        href="/mon-site#statistiques"
        variant="secondary"
        data-testid="install-measure-link"
        className="mt-5"
        iconRight={<ArrowRight size={18} aria-hidden />}
      >
        Installer le code de mesure
      </LinkButton>
    </section>
  );
}
