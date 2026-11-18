"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { BILLING_PERIOD_LABELS, PLANS, type BillingPeriod, type PlanId } from "@theralys/db/plans";
import { Badge, Button, Card, Input, Label, Modal, Segmented } from "@theralys/ui";
import type { ContactDetail } from "@/lib/crm/data";
import { EMPTY_FILTERS, filtersHref } from "@/lib/crm/filters";
import { dateInputValue, dateTime, dueDateFromInput, dueLabel, euros, shortDate } from "@/lib/crm/format";
import { ACTIVITY_LABELS, CRM_STAGES, LOGGABLE_KINDS, STAGE_META, contactMonthlyValue, displayName, isCrmStage, isPeriodInterest, isPlanInterest, sourceLabel, type ActivityKind, type CrmStage, type LoggableKind } from "@/lib/crm/model";
import { departmentOf, formatPhone } from "@/lib/crm/normalize";
import { addTask, completeTask, deleteActivity, deleteContact, logActivity, setStage } from "../actions";
import { ContactModal } from "../contact-modal";

const DAY = 86_400_000;

const KIND_PLACEHOLDER: Record<LoggableKind, string> = {
  note: "Ce qu'il faut retenir…",
  call: "Ce qui s'est dit au téléphone, ou « pas de réponse, message laissé »…",
  email: "Ce que vous avez envoyé, ce qu'il a répondu…",
  meeting: "Ce qui est ressorti du rendez-vous…",
};

const KIND_DOT: Record<string, string> = {
  note: "bg-ink-300",
  call: "bg-primary-500",
  email: "bg-info-500",
  meeting: "bg-warning-500",
  task: "bg-success-500",
  stage: "bg-primary-700",
  system: "bg-ink-500",
};

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
  const stage: CrmStage = isCrmStage(contact.stage) ? contact.stage : "new";
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
      <Link href="/crm" className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline">
        ← Tous les prospects
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{name}</h1>
          {contact.company && contact.company !== name ? <p className="mt-0.5 text-base text-ink-700">{contact.company}</p> : null}
          {place ? <p className="mt-0.5 text-sm text-ink-500">{place}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contact.doNotContact ? <Badge tone="danger">Ne pas contacter</Badge> : null}
            {contact.tags.map((tag) => (
              <Link key={tag} href={filtersHref({ ...EMPTY_FILTERS, tag })}>
                <Badge>{tag}</Badge>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
              if (!window.confirm(`Supprimer définitivement la fiche de ${name} et tout son historique ?`)) return;
              startWork(async () => {
                const result = await deleteContact(contact.id);
                if (result.ok) router.push("/crm");
                else setError(result.error);
              });
            }}
          >
            Supprimer
          </Button>
        </div>
      </div>

      {/* Étape du cycle de vente : un clic la change, l'historique le note */}
      <div className="mt-5 overflow-x-auto pb-1">
        <ol className="flex min-w-max gap-1.5" aria-label="Étape du cycle de vente">
          {CRM_STAGES.map((entry, index) => {
            const current = entry === stage;
            const passed = stage !== "lost" && entry !== "lost" && index < CRM_STAGES.indexOf(stage);
            return (
              <li key={entry}>
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  disabled={working}
                  title={STAGE_META[entry].hint}
                  onClick={() => changeStage(entry)}
                  className={clsx(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    current
                      ? entry === "lost"
                        ? "border-danger-500 bg-danger-500 text-white"
                        : entry === "won"
                          ? "border-success-500 bg-success-500 text-white"
                          : "border-primary-500 bg-primary-500 text-white"
                      : passed
                        ? "border-primary-200 bg-primary-50 text-primary-900 hover:border-primary-400"
                        : "border-cream-300 bg-white text-ink-700 hover:border-primary-300",
                  )}
                >
                  {STAGE_META[entry].label}
                </button>
              </li>
            );
          })}
        </ol>
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
              <ol className="mt-5 space-y-4">
                {timeline.map((activity) => (
                  <li key={activity.id} className="group flex gap-3">
                    <span aria-hidden className={clsx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", KIND_DOT[activity.kind] ?? "bg-ink-300")} />
                    <div className="min-w-0 flex-1">
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
                ))}
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
