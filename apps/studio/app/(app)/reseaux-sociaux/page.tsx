import { hasSocialMedia } from "@theralys/db";
import { Card } from "@theralys/ui";
import { SOCIAL_BIO_LINE } from "@theralys/ai";
import { monthRange } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { clampIsoDay, parisDay, parseMonthParam, shiftIsoDay } from "@/lib/calendar";
import { getSite, siteUrl } from "@/lib/data";
import {
  getSocialMonth,
  getSocialRequestUsage,
  isMissingSchemaError,
  SOCIAL_HORIZON_DAYS,
  type SocialMonthData,
  type SocialRequestUsage,
} from "@/lib/social/data";
import { getSocialRegenerationUsage, type SocialRegenerationUsage } from "@/lib/social/regen";
import { swatchesFor } from "@/lib/social/render/theme";
import { getSocialSettings, type SocialSettingsView } from "@/lib/social/settings";
import { SocialClient } from "./social-client";

export const metadata = { title: "Réseaux sociaux" };
export const dynamic = "force-dynamic";
// Préparation du mois en mode live : 25-60 s attendus (§5.5)
export const maxDuration = 300;

type Props = { searchParams: Promise<{ mois?: string; post?: string }> };

/** `?post=<id>` (lien profond : export ICS, notifications) — un id mal formé est ignoré. */
const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SocialPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Les démos présentent l'offre complète ; les clients suivent leur formule (Scale)
  if (site.type !== "demo" && !hasSocialMedia(site.plan)) {
    return (
      <Fallback title="Les contenus réseaux sociaux ne sont pas inclus dans votre formule">
        Passez à la formule <strong>Scale</strong> pour recevoir chaque mois vos contenus
        réseaux sociaux prêts à poster — visuels dans vos couleurs, carrousels, stories et
        légendes — préparés à partir de votre site, en plus du blog SEO, des outils de
        mots-clés et de l&apos;Académie.
      </Fallback>
    );
  }

  const { mois, post } = await searchParams;
  const now = new Date();
  const { year, month } = parseMonthParam(mois, now);
  const initialPostId = post && POST_ID_RE.test(post) ? post.toLowerCase() : null;

  let data: SocialMonthData;
  let usage: SocialRequestUsage;
  let regen: SocialRegenerationUsage;
  let settings: SocialSettingsView;
  try {
    // Réglages « Paramétrage » d'abord : les créneaux du mois suivent les jours de publication choisis
    settings = await getSocialSettings(site.id);
    [data, usage, regen] = await Promise.all([
      getSocialMonth(site.id, year, month, now, settings.postDays),
      getSocialRequestUsage(site.id, now),
      getSocialRegenerationUsage(site.id, now),
    ]);
  } catch (err) {
    // Déploiement avant les migrations `social_posts` / `social_settings` : page utilisable plutôt qu'une erreur 500
    if (!isMissingSchemaError(err)) throw err;
    console.error("[social] schéma absent — migrations 0001/0002 non appliquées ?", err);
    return (
      <Fallback title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        Vos contenus prêts à poster seront préparés à partir de votre site dès l&apos;activation.
      </Fallback>
    );
  }

  // Bornes des formulaires au jour civil des praticiens (Europe/Paris) ; les
  // créneaux et les bornes de mois restent en UTC.
  const todayIso = parisDay(now);
  const min = shiftIsoDay(todayIso, 1);
  const max = shiftIsoDay(todayIso, SOCIAL_HORIZON_DAYS);
  // Date par défaut de la barre : prochain créneau à pourvoir, sinon le premier
  // jour ≥ demain du mois affiché, sinon demain — toujours dans [min, max].
  const { startIso, endIso } = monthRange(year, month);
  const firstInMonth = startIso > min ? startIso : min;
  const wanted = data.state.freeSlots[0]?.date ?? (firstInMonth < endIso ? firstInMonth : min);

  return (
    <SocialClient
      year={year}
      month={month}
      items={data.items}
      state={data.state}
      usage={usage}
      swatches={swatchesFor(site.theme)}
      siteName={site.name}
      siteUrl={siteUrl(site)}
      bioLine={SOCIAL_BIO_LINE}
      regenRemaining={regen.remaining}
      initialPostId={initialPostId}
      todayIso={todayIso}
      requestDates={{ default: clampIsoDay(wanted, min, max), min, max }}
      settings={settings}
    />
  );
}

function Fallback({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-4xl font-bold">Réseaux sociaux</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </Card>
    </div>
  );
}
