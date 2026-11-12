"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import type { ExternalProfileOverrides, ExternalSiteProfile, ExternalSiteSource } from "@theralys/shared";
import { RUBRICS, isRubricCorrected, isRubricEmpty, type RubricId } from "@/lib/external-site/rubrics";
import { restoreExternalRubric } from "./actions";
import { ActionMessage } from "./fields";
import { Pill } from "./pill";
import { RubricForm } from "./rubric-form";
import { RubricView } from "./rubric-view";

/**
 * « Ce que nous avons compris de votre site » : le profil effectif (lu, puis
 * corrigé), rubrique par rubrique. Chaque rubrique dit d'où elle vient (« lu
 * sur votre site » ou « corrigé par vous »), s'ouvre en formulaire sur place,
 * et, corrigée, peut être rétablie telle qu'elle a été lue.
 */
export function ProfileSection({
  siteUrl,
  source,
  profile,
  overrides,
}: {
  siteUrl: string;
  source: ExternalSiteSource;
  profile: ExternalSiteProfile;
  overrides: ExternalProfileOverrides | null;
}) {
  return (
    <section id="profil" aria-labelledby="profile-title" className="scroll-mt-6" data-testid="profile-section">
      <Card className="p-6 md:p-7">
        <h2 id="profile-title" className="text-xl font-semibold">
          Ce que nous avons compris de votre site
        </h2>
        <p className="mt-1 max-w-2xl text-base text-ink-700">
          Vos contenus s&apos;appuient sur ce profil : relisez-le et corrigez ce qui doit l&apos;être. Vos corrections sont conservées à chaque nouvelle lecture de votre site.
        </p>
        <div className="mt-5 divide-y divide-cream-200 border-t border-cream-200">
          {RUBRICS.map((rubric) => (
            <RubricBlock key={rubric.id} rubric={rubric.id} title={rubric.title} siteUrl={siteUrl} source={source} profile={profile} overrides={overrides} />
          ))}
        </div>
      </Card>
    </section>
  );
}

function RubricBlock({
  rubric,
  title,
  siteUrl,
  source,
  profile,
  overrides,
}: {
  rubric: RubricId;
  title: string;
  siteUrl: string;
  source: ExternalSiteSource;
  profile: ExternalSiteProfile;
  overrides: ExternalProfileOverrides | null;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-restore">("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editId = `${titleId}-edit`;
  const confirmId = `${titleId}-confirm`;
  const returnFocus = useRef(false);

  const corrected = isRubricCorrected(overrides, rubric);
  const empty = isRubricEmpty(profile, rubric);
  const pasted = source === "pasted";

  // Formulaire ou confirmation refermés : le focus revient au bouton « Modifier » ; confirmation ouverte : à son premier bouton
  useEffect(() => {
    if (mode === "confirm-restore") document.getElementById(confirmId)?.focus();
    if (mode === "view" && returnFocus.current) {
      returnFocus.current = false;
      document.getElementById(editId)?.focus();
    }
  }, [mode, confirmId, editId]);

  function close(next: { notice?: string } = {}) {
    returnFocus.current = true;
    setNotice(next.notice ?? null);
    setMode("view");
  }

  function restore() {
    setFailure(null);
    startTransition(async () => {
      const result = await restoreExternalRubric(rubric);
      // Suite marquée comme transition elle aussi : la confirmation se referme dans le même rendu que le profil relu
      startTransition(() => {
        if (result.error) setFailure(result.error);
        else close({ notice: pasted ? "Rubrique rétablie telle qu'elle a été lue dans votre texte." : "Rubrique rétablie telle qu'elle a été lue sur votre site." });
      });
    });
  }

  const origin = corrected
    ? "corrigé par vous"
    : empty
      ? pasted
        ? "rien trouvé dans votre texte"
        : "rien trouvé sur votre site"
      : pasted
        ? "lu dans votre texte"
        : "lu sur votre site";

  return (
    <section aria-labelledby={titleId} className="py-5" data-testid={`rubric-${rubric}`} data-corrected={corrected} data-empty={empty}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 id={titleId} className="text-lg font-semibold">
            {title}
          </h3>
          <Pill tone={corrected ? "primary" : "neutral"} data-testid={`rubric-${rubric}-origin`}>
            {origin}
          </Pill>
        </div>
        {mode === "view" ? (
          <div className="flex flex-wrap items-center gap-2">
            {corrected ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotice(null);
                  setFailure(null);
                  setMode("confirm-restore");
                }}
                aria-label={`Rétablir ce qui a été lu, rubrique ${title}`}
                data-testid={`rubric-${rubric}-restore`}
              >
                Rétablir ce qui a été lu
              </Button>
            ) : null}
            <Button
              id={editId}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setNotice(null);
                setFailure(null);
                setMode("edit");
              }}
              aria-label={`${empty ? "Compléter" : "Modifier"} la rubrique ${title}`}
              data-testid={`rubric-${rubric}-edit`}
            >
              {empty ? "Compléter" : "Modifier"}
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "edit" ? (
        <RubricForm rubric={rubric} title={title} profile={profile} siteUrl={siteUrl} onClose={(saved) => close(saved ? { notice: "Correction enregistrée." } : {})} />
      ) : (
        <div className="mt-3 max-w-3xl text-base text-ink-700" data-testid={`rubric-${rubric}-content`}>
          {empty ? (
            <p>
              {corrected
                ? "Vous avez vidé cette rubrique : vos outils n'en tiennent plus compte."
                : pasted
                  ? "Nous n'avons rien trouvé à ce sujet dans votre texte. Vous pouvez compléter cette rubrique."
                  : "Nous n'avons rien trouvé à ce sujet sur votre site. Vous pouvez compléter cette rubrique."}
            </p>
          ) : (
            <RubricView rubric={rubric} profile={profile} />
          )}
        </div>
      )}

      {mode === "confirm-restore" ? (
        <div className="mt-3 rounded-2xl bg-cream-100 px-4 py-3" role="group" aria-label={`Rétablir la rubrique ${title}`} data-testid={`rubric-${rubric}-restore-confirm`}>
          <p className="text-sm text-ink-900">Votre correction de cette rubrique sera effacée, et la rubrique reprendra ce qui a été lu{pasted ? " dans votre texte" : " sur votre site"}.</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button id={confirmId} type="button" size="sm" disabled={pending} onClick={restore} data-testid={`rubric-${rubric}-restore-yes`}>
              {pending ? <Spinner className="text-white" /> : null} Oui, rétablir
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => close()}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-2">
        <ActionMessage error={failure} notice={notice} testId={`rubric-${rubric}-message`} />
      </div>
    </section>
  );
}
