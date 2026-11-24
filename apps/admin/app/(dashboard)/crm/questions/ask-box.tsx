"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { Button, Spinner } from "@theralys/ui";
import type { AskOutcome } from "@/lib/crm/knowledge/ask";
import { KNOWLEDGE_LIMITS, categoryLabel } from "@/lib/crm/knowledge/model";
import { askQuestion } from "./actions";
import { EntryBody, KindChip, StatusChip } from "./entry-view";

/** Ce qu'on entend le plus au téléphone : un clic remplit le champ, pour montrer comment s'en servir. */
const EXAMPLES = ["C'est trop cher pour moi", "J'ai déjà un site", "Je n'ai pas le temps de m'en occuper"];

const ORIGIN_NOTE = {
  known: "Cette question est déjà dans la base : voici sa fiche.",
  matched: "Une fiche de la base répond déjà à cette question.",
  new: "Nouvelle fiche, ajoutée à la base commune.",
} as const;

/**
 * L'encart « Une question sur Harmony ? » : on y pose la question comme le
 * praticien l'a posée, la réponse s'affiche dessous et rejoint la base
 * commune. `compact` : la version posée dans le CRM, au-dessus des prospects.
 */
export function AskBox({ total, compact = false }: { total: number; compact?: boolean }) {
  const router = useRouter();
  const fieldId = useId();
  const [question, setQuestion] = useState("");
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [pending, start] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !question.trim()) return;
    start(async () => {
      const result = await askQuestion(question);
      setOutcome(result);
      if (result.ok) {
        setQuestion("");
        // La liste de la base et le compteur de fiches suivent
        router.refresh();
      }
    });
  };

  return (
    <section
      data-testid="encart-question"
      aria-labelledby={`${fieldId}-titre`}
      className="rounded-card border border-primary-200 bg-[linear-gradient(135deg,var(--color-primary-50),#fff_55%)] p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-500 text-white">
            <MessageCircleQuestion size={20} />
          </span>
          <div className="min-w-0">
            <h2 id={`${fieldId}-titre`} className="text-lg font-semibold text-ink-900">
              Une question ou une objection sur Harmony ?
            </h2>
            <p className="mt-0.5 text-sm text-ink-700">Écrivez-la comme le praticien vous l&apos;a dite : vous recevez ce qu&apos;il faut lui répondre, et la fiche rejoint la base de l&apos;équipe.</p>
          </div>
        </div>
        {compact ? (
          <Link href="/crm/questions" className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-100 pointer-coarse:min-h-11">
            Ouvrir la base{total > 0 ? ` · ${total.toLocaleString("fr-FR")} fiche${total > 1 ? "s" : ""}` : ""}
            <ArrowRight size={15} aria-hidden />
          </Link>
        ) : null}
      </div>

      <form onSubmit={submit} className="mt-4">
        <label htmlFor={fieldId} className="sr-only">
          Votre question
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea
            id={fieldId}
            name="question"
            rows={compact ? 1 : 2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Entrée envoie ; Maj + Entrée passe à la ligne
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={KNOWLEDGE_LIMITS.question}
            disabled={pending}
            placeholder="Ex. : « J'ai déjà un site, pourquoi changer ? »"
            // Sur téléphone, deux lignes dès le départ : l'exemple du champ s'y lit en entier
            className="min-h-[4.5rem] w-full flex-1 resize-y rounded-2xl border border-ink-300 bg-white px-4 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none disabled:bg-cream-100 sm:min-h-11"
          />
          <Button type="submit" disabled={pending || question.trim().length === 0} className="min-h-11 shrink-0 px-5">
            {pending ? (
              <>
                <Spinner className="text-white!" />
                Recherche…
              </>
            ) : (
              "Demander à Harmony"
            )}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={pending}
              onClick={() => setQuestion(example)}
              className="rounded-full border border-cream-300 bg-white px-3 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-primary-300 hover:text-primary-700 pointer-coarse:min-h-11 pointer-coarse:px-4"
            >
              {example}
            </button>
          ))}
          <span className="text-xs text-ink-500">Sans nom ni coordonnées de prospect : la question est partagée avec l&apos;équipe.</span>
        </div>
      </form>

      <div aria-live="polite" className={clsx(pending || outcome ? "mt-4" : "")}>
        {pending ? (
          <p className="text-sm text-ink-700">Harmony cherche la réponse dans ce qu&apos;elle sait du produit. Comptez quelques secondes.</p>
        ) : outcome && !outcome.ok ? (
          <p role="alert" data-testid="question-erreur" className="rounded-xl bg-danger-100 px-3 py-2 text-sm text-[#991b1b]">
            {outcome.error}
          </p>
        ) : outcome ? (
          <article data-testid="question-reponse" data-origin={outcome.origin} className="rounded-2xl border border-cream-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <KindChip kind={outcome.entry.kind} />
              <StatusChip status={outcome.entry.status} />
              <span className="text-xs text-ink-500">{categoryLabel(outcome.entry.category)}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-ink-900">{outcome.entry.question}</h3>
            <div className="mt-3">
              <EntryBody entry={outcome.entry} />
            </div>
            <p className="mt-3 text-xs text-ink-500">{ORIGIN_NOTE[outcome.origin]}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
