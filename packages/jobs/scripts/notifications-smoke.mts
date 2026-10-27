/**
 * Test de fumée des notifications e-mail (e-mail hebdomadaire « Vos contenus
 * de la semaine » et rappel « Préparez votre mois »), sur la base locale et
 * sans fournisseur (un fournisseur de capture remplace Resend : rien ne part,
 * les e-mails générés sont affichés) :
 *
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys \
 *          AUTH_SECRET=… AI_MOCK=1 SITES_BASE_URL=http://localhost:3000
 *   pnpm --filter @theralys/jobs exec tsx scripts/notifications-smoke.mts
 *
 * Déroulé, pour le site démo `SMOKE_SITE_SLUG` (défaut :
 * claire-dupont-sophrologue-albi, qui doit avoir un compte client) :
 * 1. force un lundi (Europe/Paris) : le lundi de la première semaine ISO qui
 *    contient un contenu `ready` du site, social ou Google, sinon le prochain
 *    lundi — et lance `sendWeeklyContentDigests` ;
 * 2. force un 25 dont le mois suivant n'a aucun contenu (le premier 25 après
 *    le dernier contenu du site) et lance `sendMonthReminders` ;
 * 3. relance les deux ticks aux mêmes dates : 0 envoi (idempotence par
 *    `notification_log`) ;
 * 4. retire ses propres lignes `notification_log` (site + kind + période de
 *    ce passage uniquement). Aucune autre écriture : ni seed, ni suppression.
 *
 * Les autres sites de la base ayant un compte client et des contenus sur ces
 * périodes recevraient aussi un e-mail (capturé) : le script ne liste que
 * ceux du site visé mais compte les autres dans « processed ».
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, googlePosts, notificationLog, sites, socialPosts, users } from "@theralys/db";
import type { MailMessage, MailProvider } from "@theralys/providers/mail";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const {
  MONTH_REMINDER_KIND,
  WEEKLY_DIGEST_KIND,
  isoWeekOf,
  nextMonthOf,
  sendMonthReminders,
  sendWeeklyContentDigests,
  shiftDay,
} = await import("../src/notifications.ts");

const SLUG = process.env.SMOKE_SITE_SLUG ?? "claire-dupont-sophrologue-albi";

/** Fournisseur de capture : rien ne part, les messages sont gardés pour l'affichage. */
class CaptureMailProvider implements MailProvider {
  mode = "mock" as const;
  messages: MailMessage[] = [];
  async send(message: MailMessage) {
    this.messages.push(message);
    return { sent: false };
  }
}

const db = getDb();
const site = await db.query.sites.findFirst({ where: eq(sites.slug, SLUG) });
if (!site) throw new Error(`Site « ${SLUG} » introuvable : lancez le seed (pnpm db:seed).`);
const accounts = await db.query.users.findMany({ where: and(eq(users.role, "client"), eq(users.siteId, site.id)) });
if (accounts.length === 0) throw new Error(`Le site « ${SLUG} » n'a aucun compte client.`);
console.log(`Site ${site.slug} (${site.type}, ${site.plan}) — ${accounts.length} compte(s) client — STUDIO_BASE_URL : ${process.env.STUDIO_BASE_URL ?? "(défaut)"}`);

// Contenus du site, pour choisir des dates qui ont du sens
const [social, google] = await Promise.all([
  db.query.socialPosts.findMany({ where: eq(socialPosts.siteId, site.id), orderBy: [asc(socialPosts.scheduledFor)], columns: { scheduledFor: true, status: true } }),
  db.query.googlePosts.findMany({ where: eq(googlePosts.siteId, site.id), orderBy: [asc(googlePosts.scheduledFor)], columns: { scheduledFor: true, status: true } }),
]);
const readyDates = [...social, ...google].filter((p) => p.status === "ready").map((p) => p.scheduledFor).sort();
const allDates = [...social, ...google].map((p) => p.scheduledFor).sort();
console.log(`Contenus : ${social.length} social, ${google.length} Google (${readyDates.length} prêts, du ${allDates[0] ?? "—"} au ${allDates[allDates.length - 1] ?? "—"})`);

// 1. Lundi forcé (7 h à Paris = 6 h UTC, comme le cron) de la première semaine avec un contenu prêt
const firstReady = readyDates[0] ?? isoWeekOf(new Date().toISOString().slice(0, 10)).monday;
const week = isoWeekOf(firstReady);
const monday = new Date(`${week.monday}T06:00:00Z`);
// 2. Un 25 dont le mois suivant est vide : le premier 25 après le dernier contenu du site
const lastDate = allDates[allDates.length - 1] ?? new Date().toISOString().slice(0, 10);
const after = shiftDay(lastDate.slice(0, 7) + "-01", 32).slice(0, 7); // mois suivant le dernier contenu
const the25th = new Date(`${after}-25T06:00:00Z`);
const reminderMonth = nextMonthOf(the25th);

const recipients = accounts.map((a) => a.email);
function cleanupCondition() {
  return and(
    eq(notificationLog.siteId, site!.id),
    inArray(notificationLog.periodKey, [week.key, reminderMonth.key]),
    inArray(notificationLog.kind, [WEEKLY_DIGEST_KIND, MONTH_REMINDER_KIND]),
  );
}

// Lignes résiduelles d'un passage précédent interrompu : retirées pour que l'envoi ait lieu
const residual = await db.delete(notificationLog).where(cleanupCondition()).returning({ id: notificationLog.id });
if (residual.length > 0) console.log(`→ ${residual.length} ligne(s) notification_log d'un passage précédent retirée(s)`);

function show(messages: MailMessage[]) {
  const mine = messages.filter((m) => recipients.includes(m.to));
  for (const m of mine) {
    console.log(`\n┌─ À : ${m.to}\n│ Sujet : ${m.subject}\n│ HTML : ${m.html?.length ?? 0} caractères\n├─ Texte :`);
    for (const line of m.text.split("\n")) console.log(`│ ${line}`);
    console.log("└─");
  }
  if (messages.length > mine.length) console.log(`(+ ${messages.length - mine.length} e-mail(s) capturé(s) pour d'autres sites)`);
}

try {
  console.log(`\n=== E-mail hebdomadaire — lundi forcé ${week.monday} (${week.key}) ===`);
  const weeklyMail = new CaptureMailProvider();
  const weekly = await sendWeeklyContentDigests(monday, { mail: weeklyMail });
  console.log(`✔ ${weekly.task}: ${weekly.processed} site(s)`);
  show(weeklyMail.messages);

  console.log(`\n=== Rappel mensuel — 25 forcé (${after}-25), mois suivant ${reminderMonth.key} ===`);
  const reminderMail = new CaptureMailProvider();
  const reminder = await sendMonthReminders(the25th, { mail: reminderMail });
  console.log(`✔ ${reminder.task}: ${reminder.processed} site(s)`);
  show(reminderMail.messages);

  console.log("\n=== Second passage aux mêmes dates (idempotence) ===");
  const again = new CaptureMailProvider();
  const [weekly2, reminder2] = [await sendWeeklyContentDigests(monday, { mail: again }), await sendMonthReminders(the25th, { mail: again })];
  console.log(`✔ ${weekly2.task}: ${weekly2.processed} site(s) · ${reminder2.task}: ${reminder2.processed} site(s) · e-mails capturés : ${again.messages.length}`);
  const mine = again.messages.filter((m) => recipients.includes(m.to)).length;
  if (mine !== 0) throw new Error(`Idempotence rompue : ${mine} e-mail(s) renvoyé(s) au site ${site.slug}`);

  const logged = await db.query.notificationLog.findMany({ where: cleanupCondition() });
  console.log(`Journal : ${logged.map((l) => `${l.kind}/${l.periodKey} (sent=${l.sent})`).join(", ") || "aucune ligne"}`);
} finally {
  const removed = await db.delete(notificationLog).where(cleanupCondition()).returning({ id: notificationLog.id });
  console.log(`\n→ nettoyage : ${removed.length} ligne(s) notification_log du site ${site.slug} retirée(s)`);
  await globalThis.__theralysPool?.end();
}
