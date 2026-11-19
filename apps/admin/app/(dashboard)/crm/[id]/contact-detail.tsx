"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowRightLeft, CalendarCheck, CircleCheck, CircleX, Cog, Mail, Phone, StickyNote, type LucideIcon } from "lucide-react";
import { BILLING_PERIOD_LABELS, PLANS, type BillingPeriod, type PlanId } from "@theralys/db/plans";
import { Badge, Button, Card, Input, Label, Modal, Segmented } from "@theralys/ui";
import type { ContactDetail } from "@/lib/crm/data";
import { EMPTY_FILTERS, filtersHref } from "@/lib/crm/filters";
import { dateInputValue, dateTime, dueDateFromInput, dueLabel, euros, shortDate } from "@/lib/crm/format";
import { ACTIVITY_LABELS, CRM_STAGES, LOGGABLE_KINDS, STAGE_META, contactMonthlyValue, displayName, isPeriodInterest, isPlanInterest, isTrashed, sourceLabel, stageOf, type ActivityKind, type CrmStage, type LoggableKind } from "@/lib/crm/model";
import { departmentOf, formatPhone } from "@/lib/crm/normalize";
import { addTask, completeTask, deleteActivity, deleteContact, logActivity, purgeFromTrash, restoreFromTrash, setStage } from "../actions";
import { ContactModal } from "../contact-modal";
import { Avatar } from "../ui";
import { STAGE_COLOR, STAGE_ICON } from "@/lib/crm/stage-style";

const DAY = 86_400_000;

const KIND_PLACEHOLDER: Record<LoggableKind, string> = {
  note: "Ce qu'il faut retenir…",
  call: "Ce qui s'est dit au téléphone, ou « pas de réponse, message laissé »…",
  email: "Ce que vous avez envoyé, ce qu'il a répondu…",
  meeting: "Ce qui est ressorti du rendez-vous…",
};

/** Historique : une tuile d'icône par nature d'événement (le libellé à côté dit la même chose en toutes lettres). */
const KIND_ICON: Record<string, { icon: LucideIcon; tile: string }> = {
  note: { icon: StickyNote, tile: "bg-cream-200 text-ink-700" },
  call: { icon: Phone, tile: "bg-primary-100 text-primary-800" },
  email: { icon: Mail, tile: "bg-info-100 text-info-500" },
  meeting: { icon: CalendarCheck, tile: "bg-warning-100 text-ink-900" },
  task: { icon: CircleCheck, tile: "bg-success-100 text-success-500" },
  stage: { icon: ArrowRightLeft, tile: "bg-primary-50 text-primary-700" },
  system: { icon: Cog, tile: "bg-cream-100 text-ink-500" },
};

/** Le parcours d'une affaire jusqu'à la signature ; « Perdu » en sort, à part. */
const PATH: CrmStage[] = CRM_STAGES.filter((entry) => entry !== "lost");

export function ContactDetailClient({ detail, nowIso, sitesBaseUrl }: { detail: ContactDetail; nowIso: string; sitesBaseUrl: string }) {
  const { contact, activities, site, importName } = detail;
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [working, startWork] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const name = displayName(contact);
  // À la corbeille, la fiche se consulte mais ne se modifie plus : elle garde l'étape qu'elle retrouvera
  const trashed = isTrashed(contact.stage);
  const stage: CrmStage = stageOf(contact.stage);
  const value = contactMonthlyValue(contact);

  const act = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    startWork(async () => {
      const result = await work();
      setError(result.ok ? null : result.error);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });

  const changeStage = (next: CrmStage) => {
    if (next === stage) return;
    if (next === "lost") {
      setLostReason("");
      setLostOpen(true);
    } else act(() => setStage({ id: contact.id, stage: next }));
  };

  const tasks = activities.filter((activity) => activity.kind === "task");
  const openTasks = tasks.filter((task) => !task.doneAt).sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));
  const timeline = activities.filter((activity) => activity.kind !== "task" || activity.doneAt);
  const place = [contact.profession, [contact.postalCode, contact.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const department = departmentOf(contact.postalCode);
  const extra = Object.entries(contact.extra ?? {});

  return (
    <div>
      <Link href={trashed ? "/crm/corbeille" : "/crm"} className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline">
        {trashed ? "← Corbeille" : "← Tous les prospects"}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar contact={contact} size="lg" className="mt-0.5 shadow-sm" />
          <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{name}</h1>
          {contact.company && contact.company !== name ? <p className="mt-0.5 text-base text-ink-700">{contact.company}</p> : null}
          {place ? <p className="mt-0.5 text-sm text-ink-500">{place}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contact.doNotContact ? <Badge tone="danger">Ne pas contacter</Badge> : null}
            {contact.tags.map((tag) => (
              <Link key={tag} href={filtersHref({ ...EMPTY_FILTERS, view: "liste", tag })}>
                <Badge>{tag}</Badge>
              </Link>
            ))}
          </div>
          </div>
        </div>
        <div className={clsx("flex flex-wrap gap-2", trashed && "hidden")}>
          {site ? (
            <Link href={site.type === "client" ? "/clients" : `/demos/${site.id}/edit`} className="rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-cream-100">
              {site.type === "client" ? "Voir le client" : "Ouvrir sa démo"}
            </Link>
          ) : (
            <Link href={`/demos?prospect=${contact.id}`} className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600">
              Créer sa démo
            </Link>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            disabled={working}
            onClick={() => {
              // Sans confirmation : la fiche part à la corbeille, d'où elle se restaure
              startWork(async () => {
                const result = await deleteContact(contact.id);
                if (result.ok) router.push("/crm/corbeille");
                else setError(result.error);
              });
            }}
          >
            Supprimer
          </Button>
        </div>
      </div>

      {trashed ? (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-500/40 bg-warning-100 px-5 py-4 text-sm text-ink-900">
          <p>
            <span className="font-semibold">Cette fiche est à la corbeille</span> depuis le {dateTime(new Date(contact.updatedAt))}. Restaurez-la pour la retrouver dans le pipeline, à l&apos;étape « {STAGE_META[stage].label} ».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={working} onClick={() => act(() => restoreFromTrash({ ids: [contact.id] }))}>
              Restaurer
            </Button>
            <Button
              variant="danger"
              disabled={working}
              onClick={() => {
                if (!window.confirm(`Effacer définitivement la fiche de ${name} et tout son historique ? Cette action ne s'annule pas.`)) return;
                startWork(async () => {
                  const result = await purgeFromTrash({ ids: [contact.id] });
                  if (result.ok) router.push("/crm/corbeille");
                  else setError(result.error);
                });
              }}
            >
              Effacer définitivement
            </Button>
          </div>
        </div>
      ) : null}

      <div inert={trashed} className={clsx(trashed && "opacity-60")}>
      {/* Étape du cycle de vente : un clic la change, l'historique le note */}
      <div className="mt-6 flex items-start gap-4 overflow-x-auto rounded-card border border-cream-200 bg-white px-3 pt-4 pb-3 shadow-card">
        <ol className="relative flex min-w-[38rem] flex-1" aria-label="Étape du cycle de vente" style={{ "--stage": STAGE_COLOR[stage] } as CSSProperties}>
          {/* Le trait relie les étapes et se remplit jusqu'à celle en cours */}
          <li aria-hidden className="absolute top-[1.0625rem] h-1 rounded-full bg-cream-200" style={{ left: `${50 / PATH.length}%`, right: `${50 / PATH.length}%` }}>
            <span className="crm-track-fill block h-full rounded-full" style={{ width: `${(Math.max(PATH.indexOf(stage), 0) / (PATH.length - 1)) * 100}%` }} />
          </li>
          {PATH.map((entry, index) => {
            const current = entry === stage;
            const passed = stage !== "lost" && index < PATH.indexOf(stage);
            const Icon = STAGE_ICON[entry];
            return (
              <li key={entry} className="relative flex-1 text-center">
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  disabled={working}
                  title={STAGE_META[entry].hint}
                  onClick={() => changeStage(entry)}
                  className="group inline-flex flex-col items-center gap-1.5 rounded-lg px-1.5 pb-1 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    style={{ "--stage": STAGE_COLOR[entry] } as CSSProperties}
                    className={clsx(
                      "grid h-9 w-9 place-items-center rounded-full border-2 border-white transition duration-200",
                      current ? "crm-stage-badge crm-step-current" : passed ? "crm-stage-badge" : "!border-cream-300 bg-white text-ink-500 group-hover:!border-primary-300 group-hover:text-primary-700",
                    )}
                  >
                    <Icon size={16} strokeWidth={2.3} />
                  </span>
                  <span className={clsx("text-xs whitespace-nowrap", current ? "font-semibold text-ink-900" : "text-ink-700")}>{STAGE_META[entry].label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          aria-current={stage === "lost" ? "step" : undefined}
          disabled={working}
          title={STAGE_META.lost.hint}
          onClick={() => changeStage("lost")}
          className={clsx(
            "mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
            stage === "lost" ? "border-danger-500 bg-danger-500 text-white" : "border-cream-300 bg-white text-ink-700 hover:border-danger-500 hover:text-danger-500",
          )}
        >
          <CircleX size={15} aria-hidden />
          {STAGE_META.lost.label}
        </button>
      </div>
      {stage === "lost" && contact.lostReason ? <p className="mt-2 text-sm text-ink-700">Motif : {contact.lostReason}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <TasksCard contactId={contact.id} tasks={openTasks} now={now} working={working} act={act} />
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900">Historique</h2>
            <Composer contactId={contact.id} working={working} act={act} />
            {timeline.length === 0 ? (
              <p className="mt-5 text-sm text-ink-500">Rien pour l&apos;instant. Notez ici chaque appel, e-mail ou rendez-vous : c&apos;est la mémoire de la relation.</p>
            ) : (
              <ol className="relative mt-5 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[0.9375rem] before:w-px before:bg-cream-200">
                {timeline.map((activity, index) => {
                  const kind = KIND_ICON[activity.kind] ?? KIND_ICON.system!;
                  return (
                  <li key={activity.id} style={{ "--row": Math.min(index, 12) } as CSSProperties} className="crm-row group relative flex gap-3">
                    <span aria-hidden className={clsx("relative grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white", kind.tile)}>
                      <kind.icon size={15} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-xs text-ink-500">
                        <span className="font-semibold text-ink-700">{activity.kind === "task" ? "Tâche faite" : (ACTIVITY_LABELS[activity.kind as ActivityKind] ?? activity.kind)}</span> · {dateTime(new Date(activity.doneAt ?? activity.createdAt))}
                      </p>
                      {activity.body ? <p className="mt-0.5 text-sm break-words whitespace-pre-line text-ink-900">{activity.body}</p> : null}
                    </div>
                    {activity.kind !== "stage" && activity.kind !== "system" ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => {
                          if (window.confirm("Retirer cet élément de l'historique ?")) act(() => deleteActivity(activity.id));
                        }}
                        aria-label="Retirer cet élément de l'historique"
                        className="h-7 shrink-0 rounded px-1.5 text-xs text-ink-500 opacity-0 group-hover:opacity-100 hover:text-danger-500 focus:opacity-100"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900">Coordonnées</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Row label="E-mail">{contact.email ? <a href={`mailto:${contact.email}`} className="break-all text-primary-700 underline underline-offset-4">{contact.email}</a> : <Missing />}</Row>
              <Row label="Téléphone">{contact.phone ? <a href={`tel:${contact.phone}`} className="text-primary-700 underline underline-offset-4">{formatPhone(contact.phone)}</a> : <Missing />}</Row>
              <Row label="Site internet">{contact.website ? <a href={contact.website} target="_blank" rel="noreferrer noopener" className="break-all text-primary-700 underline underline-offset-4">{contact.website.replace(/^https?:\/\//, "")}</a> : <Missing />}</Row>
              <Row label="Adresse">{contact.address || contact.postalCode || contact.city ? <span>{[contact.address, [contact.postalCode, contact.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}{department ? <span className="text-ink-500"> ({department})</span> : null}</span> : <Missing />}</Row>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900">Suivi</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Row label="Provenance">
                {sourceLabel(contact.source)}
                {importName ? <span className="block text-xs text-ink-500">Liste « {importName} »</span> : null}
              </Row>
              <Row label="Formule envisagée">
                {isPlanInterest(contact.plan) ? (
                  <>
                    {PLANS[contact.plan as PlanId].label}
                    {isPeriodInterest(contact.billingPeriod) ? `, ${BILLING_PERIOD_LABELS[contact.billingPeriod as BillingPeriod].toLowerCase()}` : ""}
                    <span className="block text-xs text-ink-500">{euros(value)} par mois</span>
                  </>
                ) : (
                  <Missing />
                )}
              </Row>
              <Row label="Dernier contact">{contact.lastContactAt ? shortDate(new Date(contact.lastContactAt), now) : "Jamais"}</Row>
              <Row label="À cette étape depuis">{shortDate(new Date(contact.stageChangedAt), now)}</Row>
              <Row label="Ajouté le">{shortDate(new Date(contact.createdAt), now)}</Row>
              {site ? (
                <Row label={site.type === "client" ? "Site client" : "Démo"}>
                  <a href={`${sitesBaseUrl}/${site.slug}`} target="_blank" rel="noreferrer noopener" className="break-all text-primary-700 underline underline-offset-4">
                    {site.name}
                  </a>
                </Row>
              ) : null}
            </dl>
          </Card>

          {contact.notes ? (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-ink-900">Notes</h2>
              <p className="mt-2 text-sm break-words whitespace-pre-line text-ink-900">{contact.notes}</p>
            </Card>
          ) : null}

          {extra.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-ink-900">Informations du fichier</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {extra.map(([key, entry]) => (
                  <Row key={key} label={key}>
                    <span className="break-words">{entry}</span>
                  </Row>
                ))}
              </dl>
            </Card>
          ) : null}
        </aside>
      </div>

      </div>

      <ContactModal
        open={editing}
        onClose={() => setEditing(false)}
        initial={{
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          company: contact.company,
          profession: contact.profession,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          website: contact.website ?? "",
          address: contact.address ?? "",
          postalCode: contact.postalCode ?? "",
          city: contact.city,
          notes: contact.notes ?? "",
          tags: contact.tags.join(", "),
          source: contact.source,
          stage,
          plan: contact.plan ?? "",
          billingPeriod: contact.billingPeriod ?? "",
          doNotContact: contact.doNotContact,
        }}
      />

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Marquer comme perdu"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLostOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setLostOpen(false);
                act(() => setStage({ id: contact.id, stage: "lost", lostReason: lostReason.trim() || undefined }));
              }}
            >
              Marquer comme perdu
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">{name} sort du pipeline. Vous pourrez le remettre en jeu d&apos;un clic sur une autre étape.</p>
        <div className="mt-4">
          <Label htmlFor="crm-detail-lost">Motif (facultatif)</Label>
          <Input id="crm-detail-lost" value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Trop cher, pas le moment, a choisi un concurrent…" maxLength={200} />
        </div>
      </Modal>
    </div>
  );
}

type Act = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => void;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-ink-900">{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-ink-500">Non renseigné</span>;
}

function TasksCard({ contactId, tasks, now, working, act }: { contactId: string; tasks: ContactDetail["activities"]; now: Date; working: boolean; act: Act }) {
  const [body, setBody] = useState("");
  const [due, setDue] = useState(dateInputValue(new Date(now.getTime() + DAY)));
  const shortcuts: [string, number][] = [
    ["Aujourd'hui", 0],
    ["Demain", 1],
    ["Dans 3 jours", 3],
    ["Dans 1 semaine", 7],
    ["Dans 1 mois", 30],
  ];
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-ink-900">À faire</h2>
      {tasks.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {tasks.map((task) => {
            const label = task.dueAt ? dueLabel(new Date(task.dueAt), now) : null;
            return (
              <li key={task.id} className="flex items-start gap-3 rounded-xl border border-cream-200 bg-cream-50 px-3 py-2.5">
                <input type="checkbox" checked={false} disabled={working} onChange={() => act(() => completeTask({ id: task.id, done: true }))} aria-label={`Marquer « ${task.body} » comme fait`} className="mt-0.5 h-4 w-4 accent-primary-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words text-ink-900">{task.body}</p>
                  {label ? <p className={clsx("text-xs", label.tone === "danger" ? "font-semibold text-danger-500" : label.tone === "warning" ? "font-semibold text-ink-900" : "text-ink-500")}>{label.text}</p> : null}
                </div>
                <button type="button" disabled={working} onClick={() => act(() => deleteActivity(task.id))} className="rounded px-1.5 text-xs text-ink-500 hover:text-danger-500" aria-label={`Supprimer la tâche « ${task.body} »`}>
                  Supprimer
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-500">Aucune tâche prévue. Planifiez la prochaine action pour ne pas laisser ce prospect refroidir.</p>
      )}
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const dueAt = dueDateFromInput(due);
          act(
            () => (dueAt ? addTask({ contactId, body, dueAt }) : Promise.resolve({ ok: false as const, error: "Choisissez une échéance." })),
            () => setBody(""),
          );
        }}
      >
        <div>
          <Label htmlFor="crm-task-body">Prochaine action</Label>
          <Input id="crm-task-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Rappeler, envoyer la démo, relancer…" maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="crm-task-due">Échéance</Label>
          <Input id="crm-task-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} required />
        </div>
        <Button type="submit" disabled={working || body.trim() === ""}>
          Planifier
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Échéances rapides">
        {shortcuts.map(([label, days]) => {
          const value = dateInputValue(new Date(now.getTime() + days * DAY));
          return (
            <button key={label} type="button" aria-pressed={due === value} onClick={() => setDue(value)} className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium", due === value ? "border-primary-500 bg-primary-50 text-primary-900" : "border-cream-300 bg-white text-ink-700 hover:border-primary-300")}>
              {label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Composer({ contactId, working, act }: { contactId: string; working: boolean; act: Act }) {
  const [kind, setKind] = useState<LoggableKind>("note");
  const [body, setBody] = useState("");
  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        act(
          () => logActivity({ contactId, kind, body }),
          () => setBody(""),
        );
      }}
    >
      <Segmented<LoggableKind> aria-label="Type d'activité" value={kind} onChange={setKind} options={LOGGABLE_KINDS.map((entry) => ({ value: entry, label: ACTIVITY_LABELS[entry] }))} className="w-fit max-w-full flex-wrap" />
      <label htmlFor="crm-activity-body" className="sr-only">
        Détail de l&apos;activité
      </label>
      <textarea
        id="crm-activity-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={KIND_PLACEHOLDER[kind]}
        className="mt-3 w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">{kind === "note" ? "Une note ne compte pas comme un contact." : "Date le dernier contact ; un prospect « à contacter » passe à « contacté »."}</p>
        <Button type="submit" disabled={working || (kind === "note" && body.trim() === "")}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
