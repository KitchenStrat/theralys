import { ArrowRight, CalendarDays } from "lucide-react";
import { LinkButton, NextStepCard } from "@/components/ds";
import type { NextStep } from "@/lib/accueil";
import { formatDayFr } from "@/lib/calendar";
import { SETUP_COPY } from "./setup";

const arrow = <ArrowRight size={18} aria-hidden />;

/**
 * La « prochaine étape » du bandeau d'accueil : une carte, une action, choisie
 * par `pickNextStep` d'après l'état réel du compte. C'est le seul bouton
 * principal de l'écran.
 */
export function NextStepAside({ step }: { step: NextStep }) {
  switch (step.kind) {
    case "measure":
      return (
        <NextStepCard
          section="mon-site"
          title="Installez le code de mesure sur votre site"
          duration="Quelques minutes"
          action={
            <LinkButton href="/mon-site#statistiques" iconRight={arrow}>
              Installer le code
            </LinkButton>
          }
        >
          Sans lui, les visites de <span className="font-medium wrap-anywhere text-ds-ink-900">{step.address}</span> ne peuvent pas être
          comptées ici.
        </NextStepCard>
      );

    case "setup": {
      const copy = SETUP_COPY[step.key];
      return (
        <NextStepCard
          section={copy.section}
          title={copy.todo}
          action={
            <LinkButton href={copy.href} iconRight={arrow}>
              {copy.action}
            </LinkButton>
          }
        >
          {copy.description}
        </NextStepCard>
      );
    }

    case "review":
      return (
        <NextStepCard
          section="publications"
          title={`Relisez l'article du ${formatDayFr(step.date, "day")}`}
          duration={step.readingTimeMin ? `${step.readingTimeMin} min de lecture` : undefined}
          action={
            <LinkButton href={`/publications/${step.articleId}`} iconRight={arrow}>
              Relire l&apos;article
            </LinkButton>
          }
        >
          «&nbsp;{step.title}&nbsp;» {step.status === "draft" ? "est en brouillon" : "est prêt, sa parution est programmée"}. Un coup d&apos;œil
          avant sa mise en ligne : vous pouvez encore le modifier.
        </NextStepCard>
      );

    case "upcoming":
      return (
        <NextStepCard
          section="publications"
          eyebrow="À venir"
          icon={CalendarDays}
          title={`Votre prochain article est prévu le ${formatDayFr(step.date, "long")}`}
          action={
            <LinkButton href="/publications" iconRight={arrow}>
              Voir mes publications
            </LinkButton>
          }
        >
          Nous écrivons pour vous «&nbsp;{step.title}&nbsp;». Vous pourrez le relire, le modifier ou le refuser avant sa mise en ligne.
        </NextStepCard>
      );
  }
}
