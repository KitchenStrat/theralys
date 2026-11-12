"use client";

import {
  BookOpenCheck,
  CalendarCheck,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Globe,
  HeartHandshake,
  ListOrdered,
  MessageSquareText,
  PenLine,
  Phone,
  Plus,
  SearchX,
  Share2,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ExternalProfileOverrides, ExternalSiteProfile, ExternalSiteSource } from "@theralys/shared";
import { Badge, Button, Card, IconBadge, ProgressBar, type BadgeTone } from "@/components/ds";
import { plural } from "@/lib/external-site/format";
import { RUBRICS, isRubricCorrected, isRubricEmpty, type RubricId } from "@/lib/external-site/rubrics";
import { restoreExternalRubric } from "./actions";
import { ActionMessage } from "./fields";
import { RubricForm } from "./rubric-form";
import { RubricView } from "./rubric-view";
import { BADGE_WRAP, CARD_TITLE, SUB_TITLE } from "./styles";
import { Eyebrow } from "./ui";

/** Le repère de chaque rubrique : on la retrouve d'un coup d'œil dans la liste. */
const RUBRIC_ICONS: Record<RubricId, LucideIcon> = {
  presentation: MessageSquareText,
  specialties: HeartHandshake,
  about: UserRound,
  practical: ClipboardList,
  process: ListOrdered,
  faq: CircleHelp,
  contact: Phone,
  booking: CalendarCheck,
  social: Share2,
};

/** D'où vient une rubrique : corrigée par le praticien, vide, ou lue (sur le site, ou dans le texte collé). */
type Origin = "corrected" | "empty" | "read";

const originOf = (corrected: boolean, empty: boolean): Origin => (corrected ? "corrected" : empty ? "empty" : "read");

const ORIGIN_TONE: Record<Origin, BadgeTone> = { corrected: "brand", empty: "warning", read: "section" };

const originIcon = (origin: Origin, pasted: boolean): LucideIcon => (origin === "corrected" ? PenLine : origin === "empty" ? SearchX : pasted ? ClipboardCheck : Globe);

/**
 * « Ce que nous avons compris de votre site » : le profil effectif (lu, puis
 * corrigé), rubrique par rubrique. Chaque rubrique dit d'où elle vient (« lu
 * sur votre site » ou « corrigé par vous »), s'ouvre en formulaire sur place,
 * et, corrigée, peut être rétablie telle qu'elle a été lue.
 *
 * En tête, le résumé qui se lit d'un coup d'œil : combien de rubriques sont
 * remplies, et combien viennent du site, de vos corrections, ou restent à
 * compléter.
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
  const pasted = source === "pasted";
  const origins = RUBRICS.map((rubric) => originOf(isRubricCorrected(overrides, rubric.id), isRubricEmpty(profile, rubric.id)));
  const count = (origin: Origin) => origins.filter((item) => item === origin).length;
  const filled = RUBRICS.filter((rubric) => !isRubricEmpty(profile, rubric.id)).length;
  const read = count("read");
  const corrected = count("corrected");
  const empty = count("empty");

  return (
    <section id="profil" aria-labelledby="profile-title" className="scroll-mt-6" data-testid="profile-section">
      <Card padding="lg">
        <Eyebrow>Étape 2 · Relire</Eyebrow>
        <div className="mt-3 flex items-start gap-3.5">
          <IconBadge icon={BookOpenCheck} size="md" />
          <div className="min-w-0">
            <h2 id="profile-title" className={CARD_TITLE}>
              Ce que nous avons compris de votre site
            </h2>
            <p className="mt-1 max-w-[62ch] text-base text-ds-ink-700">
              Vos contenus s&apos;appuient sur ce profil&nbsp;: relisez-le et corrigez ce qui doit l&apos;être. Vos corrections sont conservées à chaque nouvelle lecture de votre site.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70" data-testid="profile-overview">
          <ProgressBar value={filled} max={RUBRICS.length} label="Rubriques remplies" valueText={`${filled} sur ${RUBRICS.length}`} />
          <ul className="mt-3 flex flex-wrap gap-2">
            {read > 0 ? (
              <li>
                <Badge tone="section" icon={pasted ? ClipboardCheck : Globe} className={BADGE_WRAP}>
                  {read} {plural(read, "lue", "lues")} {pasted ? "dans votre texte" : "sur votre site"}
                </Badge>
              </li>
            ) : null}
            {corrected > 0 ? (
              <li>
                <Badge tone="brand" icon={PenLine} className={BADGE_WRAP}>
                  {corrected} {plural(corrected, "corrigée", "corrigées")} par vous
                </Badge>
              </li>
            ) : null}
            {empty > 0 ? (
              <li>
                <Badge tone="warning" icon={SearchX} className={BADGE_WRAP}>
                  {empty} à compléter
                </Badge>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="mt-2 divide-y divide-ds-ink-200">
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
  const originKind = originOf(corrected, empty);

  return (
    <section aria-labelledby={titleId} className="py-5 last:pb-0" data-testid={`rubric-${rubric}`} data-corrected={corrected} data-empty={empty}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={RUBRIC_ICONS[rubric]} tone="soft" size="sm" />
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 id={titleId} className={SUB_TITLE}>
              {title}
            </h3>
            <Badge tone={ORIGIN_TONE[originKind]} icon={originIcon(originKind, pasted)} className={BADGE_WRAP} data-testid={`rubric-${rubric}-origin`}>
              {origin}
            </Badge>
          </div>
        </div>
        {mode === "view" ? (
          // Sur un téléphone, les actions ont toujours leur ligne, sous le titre : même disposition d'une rubrique à l'autre
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {corrected ? (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                icon={<Undo2 size={16} aria-hidden />}
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
              icon={empty ? <Plus size={16} aria-hidden /> : <PenLine size={16} aria-hidden />}
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
        // À partir de 640 px, le contenu s'aligne sous le titre : les pastilles forment un rail à gauche
        <div className="mt-3 max-w-3xl text-base text-ds-ink-700 sm:pl-12" data-testid={`rubric-${rubric}-content`}>
          {empty ? (
            <p className="rounded-ds-sm border border-dashed border-ds-ink-300 bg-ds-ink-50 px-4 py-3 text-ds-body text-ds-ink-700">
              {corrected
                ? "Vous avez vidé cette rubrique\u00a0: vos outils n'en tiennent plus compte."
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
        <div className="mt-3 rounded-ds-md bg-ds-warning-100 px-4 py-3.5 sm:ml-12" role="group" aria-label={`Rétablir la rubrique ${title}`} data-testid={`rubric-${rubric}-restore-confirm`}>
          <p className="text-ds-body text-ds-warning-900">Votre correction de cette rubrique sera effacée, et la rubrique reprendra ce qui a été lu{pasted ? " dans votre texte" : " sur votre site"}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button id={confirmId} type="button" variant="secondary" size="sm" loading={pending} icon={<Undo2 size={16} aria-hidden />} onClick={restore} data-testid={`rubric-${rubric}-restore-yes`}>
              Oui, rétablir
            </Button>
            <Button type="button" variant="quiet" size="sm" disabled={pending} onClick={() => close()}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      <div className="sm:pl-12 [&:not(:empty)]:mt-3">
        <ActionMessage error={failure} notice={notice} testId={`rubric-${rubric}-message`} />
      </div>
    </section>
  );
}
