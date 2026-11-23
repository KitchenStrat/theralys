import Link from "next/link";
import { Activity, ListTodo, Trophy, Users } from "lucide-react";
import { getDb } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireAdmin } from "@/lib/auth";
import { crmAvailable } from "@/lib/crm/data";
import { EMPTY_FILTERS, UNASSIGNED, filtersHref } from "@/lib/crm/filters";
import { dateTime, euros, shortDate } from "@/lib/crm/format";
import { loadTeam, type TeamMember } from "@/lib/crm/team";
import { activitySummary } from "@/lib/crm/team-stats";
import { STAGE_COLOR } from "@/lib/crm/stage-style";
import { SalesActivationNotice } from "../crm/activation-notice";
import { NewRepButton } from "./new-rep";
import { RepActions } from "./rep-actions";
import { RepAvatar, Stat, StatusBadge } from "./ui";

export const metadata = { title: "Équipe" };
export const dynamic = "force-dynamic";

/**
 * Équipe commerciale : les comptes des commerciaux, leur état, et ce que
 * chacun fait dans le CRM. Réservé à l'admin.
 */
export default async function TeamPage() {
  await requireAdmin();
  const db = getDb();
  if (!(await crmAvailable(db))) return <SalesActivationNotice title="L'onglet Équipe est en cours d'activation" />;

  const now = new Date();
  const { members, unassigned } = await loadTeam(db, now);
  const open = members.reduce((total, member) => total + member.stats.open, 0);
  const won = members.reduce((total, member) => total + member.stats.wonThisMonth, 0);
  const wonValue = members.reduce((total, member) => total + member.stats.wonThisMonthValue, 0);
  const overdue = members.reduce((total, member) => total + member.stats.overdueTasks, 0);
  const active = members.filter((member) => member.status === "active").length;
  // Ceux à qui des prospects peuvent passer : les comptes qui ne sont pas désactivés
  const assignable = members.filter((member) => member.status !== "disabled").map((member) => ({ id: member.id, name: member.name }));

  return (
    <div data-touch>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Équipe</h1>
          <p className="mt-1 text-sm text-ink-500">Vos commerciaux, leurs prospects et leur activité.</p>
        </div>
        <NewRepButton />
      </div>

      {members.length === 0 ? (
        <Card className="mt-6 p-8 text-center sm:p-10">
          <p className="text-lg font-semibold text-ink-900">Aucun commercial pour l&apos;instant</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700">
            Créez le compte d&apos;un commercial : vous recevez un lien à lui transmettre, il y choisit son mot de passe. Il ne voit que le CRM, et seulement les prospects que vous lui attribuez ou qu&apos;il crée lui-même.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Users} color={STAGE_COLOR.new} label="Commerciaux" value={members.length.toLocaleString("fr-FR")} hint={`${active.toLocaleString("fr-FR")} actif${active > 1 ? "s" : ""}`} />
            <Stat icon={Activity} color={STAGE_COLOR.demo} label="Prospects en cours" value={open.toLocaleString("fr-FR")} hint="suivis par l'équipe" />
            <Stat icon={Trophy} color={STAGE_COLOR.won} label="Gagnés ce mois" value={won.toLocaleString("fr-FR")} hint={wonValue > 0 ? `${euros(wonValue)} par mois` : "par l'équipe"} />
            <Stat icon={ListTodo} color={overdue > 0 ? STAGE_COLOR.lost : STAGE_COLOR.meeting} label="Tâches en retard" value={overdue.toLocaleString("fr-FR")} hint="sur leurs prospects" tone={overdue > 0 ? "danger" : undefined} />
          </div>

          {unassigned > 0 ? (
            <p className="mt-4 rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm text-ink-900">
              {unassigned.toLocaleString("fr-FR")} prospect{unassigned > 1 ? "s ne sont attribués" : " n'est attribué"} à personne.{" "}
              <Link href={filtersHref({ ...EMPTY_FILTERS, view: "liste", owner: UNASSIGNED })} className="font-medium text-primary-700 underline underline-offset-4 hover:text-primary-900">
                Les voir dans le CRM
              </Link>
            </p>
          ) : null}

          <ul className="mt-5 space-y-4">
            {members.map((member) => (
              <li key={member.id}>
                <MemberCard member={member} now={now} others={assignable.filter((other) => other.id !== member.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MemberCard({ member, now, others }: { member: TeamMember; now: Date; others: { id: string; name: string }[] }) {
  const { stats } = member;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <RepAvatar name={member.name} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">
              <Link href={`/equipe/${member.id}`} className="underline-offset-4 hover:text-primary-700 hover:underline pointer-coarse:inline-block pointer-coarse:py-2.5">
                {member.name}
              </Link>
            </h2>
            <p className="text-sm break-all text-ink-500">{member.email}</p>
          </div>
        </div>
        <StatusBadge status={member.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-5">
        <Figure label="Prospects en cours" value={stats.open.toLocaleString("fr-FR")} hint={stats.openMonthlyValue > 0 ? `${euros(stats.openMonthlyValue)} par mois` : undefined} />
        <Figure label="Gagnés ce mois" value={stats.wonThisMonth.toLocaleString("fr-FR")} hint={stats.wonThisMonthValue > 0 ? `${euros(stats.wonThisMonthValue)} par mois` : undefined} />
        <Figure label="Tâches en retard" value={stats.overdueTasks.toLocaleString("fr-FR")} danger={stats.overdueTasks > 0} />
        <Figure label="Dernière activité" value={stats.lastActivityAt ? shortDate(stats.lastActivityAt, now) : "Aucune"} small />
        <Figure label="Dernière connexion" value={member.lastLoginAt ? dateTime(member.lastLoginAt) : "Jamais"} small />
      </dl>

      <dl className="mt-3 space-y-1 border-t border-cream-200 pt-3 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-ink-700">7 derniers jours :</dt>
          <dd className="text-ink-900">{activitySummary(stats.week)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-ink-700">30 derniers jours :</dt>
          <dd className="text-ink-900">{activitySummary(stats.month)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <Link href={`/equipe/${member.id}`} className="inline-flex items-center rounded-full bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 pointer-coarse:min-h-11">
          Voir sa fiche
        </Link>
        <RepActions rep={{ id: member.id, name: member.name, status: member.status, prospects: stats.total }} others={others} />
      </div>
    </Card>
  );
}

function Figure({ label, value, hint, danger, small }: { label: string; value: string; hint?: string; danger?: boolean; small?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className={small ? "mt-0.5 text-sm font-medium text-ink-900" : `mt-0.5 text-xl font-bold tabular-nums ${danger ? "text-danger-500" : "text-ink-900"}`}>{value}</dd>
      {hint ? <dd className="text-xs text-ink-500">{hint}</dd> : null}
    </div>
  );
}
