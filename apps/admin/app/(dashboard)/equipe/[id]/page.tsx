import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ListTodo, Trophy, Wallet } from "lucide-react";
import { getDb } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireAdmin } from "@/lib/auth";
import { crmAvailable } from "@/lib/crm/data";
import { EMPTY_FILTERS, filtersHref, isUuid } from "@/lib/crm/filters";
import { dateTime, euros, shortDate } from "@/lib/crm/format";
import { ACTIVITY_LABELS, displayName, type ActivityKind } from "@/lib/crm/model";
import { STAGE_COLOR } from "@/lib/crm/stage-style";
import { REP_FEED_LIMIT, listReps, loadRep } from "@/lib/crm/team";
import { ACTIVITY_ORDER, activityTotal } from "@/lib/crm/team-stats";
import { ActivityIcon, StagePill } from "../../crm/ui";
import { RepActions } from "../rep-actions";
import { RepAvatar, Stat, StatusBadge } from "../ui";

export const metadata = { title: "Commercial" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const KIND_PLURAL: Record<string, string> = { call: "Appels", email: "E-mails", meeting: "Rendez-vous", note: "Notes" };

/**
 * Fiche d'un commercial : ses chiffres, ses prospects par étape, le fil de
 * ses dernières activités, et de quoi gérer son compte. Réservé à l'admin.
 */
export default async function RepPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  if (!(await crmAvailable(db))) redirect("/equipe");
  const now = new Date();
  const [detail, reps] = await Promise.all([loadRep(db, id, now), listReps(db)]);
  if (!detail) notFound();
  const { rep, stats, feed } = detail;
  const others = reps.filter((other) => other.id !== rep.id && other.status !== "disabled").map((other) => ({ id: other.id, name: other.name }));
  const prospectsHref = filtersHref({ ...EMPTY_FILTERS, view: "liste", owner: rep.id });

  return (
    <div data-touch>
      <Link href="/equipe" className="inline-flex items-center text-sm font-medium text-primary-700 underline-offset-4 hover:underline pointer-coarse:min-h-11">
        ← Équipe
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <RepAvatar name={rep.name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{rep.name}</h1>
            <p className="mt-0.5 text-sm break-all text-ink-500">{rep.email}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-700">
              <StatusBadge status={rep.status} />
              <span>Dernière connexion : {rep.lastLoginAt ? dateTime(rep.lastLoginAt) : "jamais"}</span>
              <span>Compte créé le {shortDate(rep.createdAt, now)}</span>
            </p>
          </div>
        </div>
        <Link href={prospectsHref} className="inline-flex items-center rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 pointer-coarse:min-h-11">
          Voir ses prospects
        </Link>
      </div>

      <div className="mt-4">
        <RepActions rep={{ id: rep.id, name: rep.name, status: rep.status, prospects: stats.total }} others={others} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Activity} color={STAGE_COLOR.demo} label="Prospects en cours" value={stats.open.toLocaleString("fr-FR")} hint={`sur ${stats.total.toLocaleString("fr-FR")} au total`} />
        <Stat icon={Wallet} color={STAGE_COLOR.qualified} label="Valeur en cours" value={euros(stats.openMonthlyValue)} hint="par mois, formules envisagées" />
        <Stat icon={Trophy} color={STAGE_COLOR.won} label="Gagnés ce mois" value={stats.wonThisMonth.toLocaleString("fr-FR")} hint={stats.wonThisMonthValue > 0 ? `${euros(stats.wonThisMonthValue)} par mois` : "depuis le 1er"} />
        <Stat icon={ListTodo} color={stats.overdueTasks > 0 ? STAGE_COLOR.lost : STAGE_COLOR.meeting} label="Tâches en retard" value={stats.overdueTasks.toLocaleString("fr-FR")} hint="sur ses prospects" tone={stats.overdueTasks > 0 ? "danger" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-900">Activité</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-ink-500 uppercase">
                <th className="py-1.5 font-medium">Type</th>
                <th className="py-1.5 text-right font-medium">7 jours</th>
                <th className="py-1.5 text-right font-medium">30 jours</th>
              </tr>
            </thead>
            <tbody>
              {ACTIVITY_ORDER.map((kind) => (
                <tr key={kind} className="border-t border-cream-200">
                  <th scope="row" className="py-2 text-left font-normal text-ink-900">
                    {KIND_PLURAL[kind]}
                  </th>
                  <td className="py-2 text-right font-semibold text-ink-900 tabular-nums">{stats.week[kind].toLocaleString("fr-FR")}</td>
                  <td className="py-2 text-right font-semibold text-ink-900 tabular-nums">{stats.month[kind].toLocaleString("fr-FR")}</td>
                </tr>
              ))}
              <tr className="border-t border-cream-300">
                <th scope="row" className="py-2 text-left font-medium text-ink-700">
                  Total
                </th>
                <td className="py-2 text-right font-bold text-ink-900 tabular-nums">{activityTotal(stats.week).toLocaleString("fr-FR")}</td>
                <td className="py-2 text-right font-bold text-ink-900 tabular-nums">{activityTotal(stats.month).toLocaleString("fr-FR")}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-500">Dernière activité : {stats.lastActivityAt ? dateTime(stats.lastActivityAt) : "aucune"}.</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-900">Ses prospects par étape</h2>
          {stats.total === 0 ? (
            <p className="mt-2 text-sm text-ink-500">Aucun prospect ne lui est attribué pour l&apos;instant.</p>
          ) : (
            <ul className="mt-2 divide-y divide-cream-200">
              {stats.byStage.map((line) => (
                <li key={line.stage}>
                  <Link href={filtersHref({ ...EMPTY_FILTERS, view: "liste", owner: rep.id, stages: [line.stage] })} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-sm hover:text-primary-700">
                    <StagePill stage={line.stage} />
                    <span className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900">{line.count.toLocaleString("fr-FR")}</span>
                      {line.monthlyValue > 0 ? <span className="text-ink-500"> · {euros(line.monthlyValue)}/mois</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold text-ink-900">Ses dernières activités</h2>
        {feed.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Rien pour l&apos;instant : ses appels, e-mails, rendez-vous, notes et changements d&apos;étape apparaîtront ici.</p>
        ) : (
          <ol className="relative mt-4 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[0.9375rem] before:w-px before:bg-cream-200">
            {feed.map((entry) => (
              <li key={entry.id} className="relative flex gap-3">
                <ActivityIcon kind={entry.kind} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs text-ink-500">
                    <span className="font-semibold text-ink-700">{entry.kind === "task" ? (entry.doneAt ? "Tâche faite" : "Tâche prévue") : (ACTIVITY_LABELS[entry.kind as ActivityKind] ?? entry.kind)}</span> · {dateTime(entry.createdAt)}
                  </p>
                  <p className="text-sm">
                    <Link href={`/crm/${entry.contact.id}`} className="font-medium text-primary-700 underline underline-offset-4 hover:text-primary-900 pointer-coarse:inline-block pointer-coarse:py-3">
                      {displayName(entry.contact)}
                    </Link>
                  </p>
                  {entry.body ? <p className="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-line text-ink-900">{entry.body}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        {feed.length === REP_FEED_LIMIT ? <p className="mt-4 text-xs text-ink-500">Les {REP_FEED_LIMIT} dernières sont affichées ; le reste est dans l&apos;historique de chaque fiche.</p> : null}
      </Card>
    </div>
  );
}
