import Link from "next/link";
import { clsx } from "clsx";
import { CheckCheck, Inbox, MessageSquareHeart, Star } from "lucide-react";
import { getDb } from "@theralys/db";
import { Badge, Card } from "@theralys/ui";
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_RATING_MAX,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TOPIC_LABELS,
  type FeedbackKind,
  type FeedbackStatus,
} from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/crm/format";
import { STAGE_COLOR } from "@/lib/crm/stage-style";
import {
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_VIEWS,
  FEEDBACK_VIEW_LABELS,
  feedbackViewFrom,
  loadFeedbackBoard,
  ratingText,
  type FeedbackCounts,
  type FeedbackRow,
  type FeedbackView,
} from "@/lib/feedback";
import { Stat } from "../equipe/ui";
import { StatusButtons } from "./status-buttons";

export const metadata = { title: "Avis clients" };
export const dynamic = "force-dynamic";

const CODE = "rounded bg-white px-1.5 py-0.5 font-mono text-[13px]";

const KIND_TONE: Record<FeedbackKind, "info" | "danger" | "warning" | "success"> = {
  idea: "info",
  problem: "danger",
  missing: "warning",
  praise: "success",
};

const STATUS_TONE: Record<FeedbackStatus, "primary" | "neutral" | "success"> = { new: "primary", read: "neutral", done: "success" };

const EMPTY: Record<FeedbackView, { title: string; text: string }> = {
  new: { title: "Aucun nouvel avis", text: "Tout est lu. Les prochains avis de vos praticiens arriveront ici." },
  read: { title: "Aucun avis en attente", text: "Les avis lus mais pas encore pris en compte s'affichent ici." },
  done: { title: "Aucun avis pris en compte pour l'instant", text: "Marquez un avis « Pris en compte » quand vous en avez fait quelque chose." },
  all: {
    title: "Aucun avis pour l'instant",
    text: "Chaque praticien peut vous écrire depuis son espace client, quelle que soit sa formule : « Donner mon avis », dans le menu et en bas de son accueil.",
  },
};

function countFor(view: FeedbackView, counts: FeedbackCounts): number {
  return view === "all" ? counts.total : counts[view];
}

/**
 * Avis clients : ce que les praticiens disent du produit depuis leur espace
 * client (« Donner mon avis »), toutes formules confondues. Réservé à l'admin.
 */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  await requireAdmin();
  const view = feedbackViewFrom((await searchParams).vue);
  const board = await loadFeedbackBoard(getDb(), view);

  if (!board.available) {
    return (
      <div role="status" className="rounded-2xl border border-warning-500/40 bg-warning-100 p-5 text-sm text-ink-900">
        <p className="text-base font-semibold">Les avis clients sont en cours d&apos;activation</p>
        <p className="mt-1">
          Cette page attend une mise à jour de la base : appliquez la migration <code className={CODE}>0016_product_feedback</code> (commande{" "}
          <code className={CODE}>pnpm db:migrate</code>, ou le fichier <code className={CODE}>packages/db/drizzle/0016_product_feedback.sql</code> dans la console Neon). Dès
          qu&apos;elle est passée, « Donner mon avis » apparaît dans chaque espace client.
        </p>
      </div>
    );
  }

  const { rows, counts, average, rated, truncated } = board;
  return (
    <div data-touch>
      <div>
        <h1 className="text-2xl font-bold">Avis clients</h1>
        <p className="mt-1 text-sm text-ink-500">Ce que vos praticiens disent de Harmony depuis leur espace client, toutes formules confondues.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Inbox} color={STAGE_COLOR.new} label="À lire" value={counts.new.toLocaleString("fr-FR")} hint={counts.new > 0 ? "nouveaux avis" : "tout est lu"} />
        <Stat icon={MessageSquareHeart} color={STAGE_COLOR.demo} label="Avis reçus" value={counts.total.toLocaleString("fr-FR")} hint="depuis l'ouverture" />
        <Stat
          icon={Star}
          color={STAGE_COLOR.meeting}
          label="Note moyenne"
          value={average === null ? "—" : ratingText(average)}
          hint={rated > 0 ? `sur ${rated.toLocaleString("fr-FR")} note${rated > 1 ? "s" : ""}` : "aucune note pour l'instant"}
        />
        <Stat icon={CheckCheck} color={STAGE_COLOR.won} label="Pris en compte" value={counts.done.toLocaleString("fr-FR")} hint="avis traités" />
      </div>

      <nav aria-label="Avis à afficher" className="mt-6 flex flex-wrap gap-2">
        {FEEDBACK_VIEWS.map((option) => {
          const active = option === view;
          return (
            <Link
              key={option}
              href={option === "new" ? "/avis" : `/avis?vue=${option}`}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                active ? "border-primary-500 bg-primary-50 text-primary-900" : "border-cream-300 bg-white text-ink-700 hover:border-primary-300",
              )}
            >
              {FEEDBACK_VIEW_LABELS[option]}
              <span className="tabular-nums text-ink-500">{countFor(option, counts).toLocaleString("fr-FR")}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <Card className="mt-5 p-8 text-center sm:p-10">
          <p className="text-lg font-semibold text-ink-900">{EMPTY[view].title}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700">{EMPTY[view].text}</p>
        </Card>
      ) : (
        <ul className="mt-5 space-y-4" data-testid="avis-liste">
          {rows.map((row) => (
            <li key={row.id}>
              <FeedbackCard row={row} />
            </li>
          ))}
        </ul>
      )}
      {truncated ? (
        <p className="mt-4 text-sm text-ink-500">
          Les {FEEDBACK_PAGE_SIZE} avis les plus récents de cette vue sont affichés : marquez-les lus ou pris en compte pour voir les précédents.
        </p>
      ) : null}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Note : ${rating} sur ${FEEDBACK_RATING_MAX}`}>
      {Array.from({ length: FEEDBACK_RATING_MAX }, (_, index) => (
        <Star key={index} size={16} aria-hidden className={index < rating ? "fill-warning-500 text-warning-500" : "text-cream-300"} />
      ))}
    </span>
  );
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={KIND_TONE[row.kind]}>{FEEDBACK_KIND_LABELS[row.kind]}</Badge>
        <span className="text-sm font-medium text-ink-900">{FEEDBACK_TOPIC_LABELS[row.topic]}</span>
        {row.rating === null ? null : <Stars rating={row.rating} />}
        <span className="ml-auto flex items-center gap-3">
          <time dateTime={row.createdAt.toISOString()} className="text-sm text-ink-500">
            {dateTime(row.createdAt)}
          </time>
          <Badge tone={STATUS_TONE[row.status]}>{FEEDBACK_STATUS_LABELS[row.status]}</Badge>
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink-900">{row.message}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-cream-200 pt-3">
        <dl className="min-w-0 space-y-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-ink-700">Cabinet :</dt>
            <dd className="text-ink-900">
              {row.site.name} <span className="text-ink-500">· formule {row.site.formula}</span>
              {row.site.demo ? (
                <>
                  {" "}
                  <Badge tone="neutral">Démo</Badge>
                </>
              ) : null}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-ink-700">De :</dt>
            <dd className="min-w-0 text-ink-900">
              {row.author ? (
                <>
                  {row.author.name}{" "}
                  {row.contactOk ? (
                    <a href={`mailto:${row.author.email}`} className="font-medium break-all text-primary-700 underline underline-offset-4 hover:text-primary-900">
                      {row.author.email}
                    </a>
                  ) : (
                    <span className="text-ink-500">· ne souhaite pas être recontacté</span>
                  )}
                </>
              ) : (
                <span className="text-ink-500">compte supprimé</span>
              )}
            </dd>
          </div>
          {row.page ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-ink-700">Depuis la page :</dt>
              <dd className="font-mono text-[13px] break-all text-ink-700">{row.page}</dd>
            </div>
          ) : null}
        </dl>
        <StatusButtons id={row.id} status={row.status} />
      </div>
    </Card>
  );
}
