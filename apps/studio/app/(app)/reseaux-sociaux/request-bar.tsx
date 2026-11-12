"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { ArrowRight, Check, Info, Lightbulb, Sparkles } from "lucide-react";
import { FieldHint, Input, Label, Select } from "@theralys/ui";
import { SOCIAL_REQUESTS_PER_MONTH, type SocialFormat } from "@theralys/shared";
import {
  Badge,
  Button,
  Card,
  GenerationProgress,
  IconBadge,
  InlineSuccess,
  LinkButton,
  NBSP,
  ProgressRing,
  type TimedStep,
} from "@/components/ds";
import { formatDayFr, monthNameFr, ofMonthFr } from "@/lib/calendar";
import type { SocialRequestUsage } from "@/lib/social/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { requestSocialPost } from "./actions";
import { CustomIcon, ErrorNote, FIELD_CLASS, FormatTile } from "./social-ui";

const FORMAT_OPTIONS: { value: SocialFormat; label: string }[] = [
  { value: "static", label: "Statique — 1 visuel" },
  { value: "carousel", label: "Carrousel — plusieurs pages à faire défiler" },
  { value: "story", label: "Story — vertical, 24 h" },
];

/** Idées de sujets : un clic remplit le champ, que le praticien adapte ensuite. */
const TOPIC_IDEAS = [
  "Le sommeil avant la rentrée",
  "Une idée reçue sur mon métier",
  "Comment se passe une première séance",
];

/**
 * Étapes de la création d'un contenu (10 à 30 secondes, un seul appel) : la
 * tâche ne remonte pas son avancement, le rythme est donc estimé et la
 * dernière étape dure jusqu'à la réponse.
 */
const REQUEST_STEPS: TimedStep[] = [
  { label: "Lecture de votre site", seconds: 4 },
  { label: "Rédaction de la légende", seconds: 10 },
  { label: "Mise en page dans vos couleurs", seconds: 8 },
];

/** Choix de couleur : automatique, une pastille de la palette (hex) ou « Autre ». */
type ColorChoice = "auto" | "other" | `#${string}`;

export function RequestBar({
  swatches,
  usage,
  dates,
  monthParam,
  todayIso,
  onCreated,
  secondaryAction = false,
}: {
  swatches: SocialSwatch[];
  usage: SocialRequestUsage;
  /** Date par défaut (prochain créneau à pourvoir, bornée), bornes min (demain) et max (+120 j) */
  dates: { default: string; min: string; max: string };
  /** « YYYY-MM » du mois affiché (lien « Voir le … » si la date en sort) */
  monthParam: string;
  /** Jour civil Europe/Paris */
  todayIso: string;
  onCreated: (postId: string, date: string) => void;
  /** Une autre action principale est déjà à l'écran (« Préparer mon mois ») : le bouton d'envoi passe au second plan */
  secondaryAction?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<SocialFormat>("static");
  const [choice, setChoice] = useState<ColorChoice>("auto");
  const [customHex, setCustomHex] = useState(swatches[0]?.hex ?? "#6b5bd2");
  const [date, setDate] = useState(dates.default);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ postId: string; date: string } | null>(null);
  // Sujet en cours de création : le champ est vidé à la réponse, l'attente garde le sien
  const [sentTopic, setSentTopic] = useState("");

  const exhausted = usage.remaining === 0;
  // Une erreur met fin à l'attente à l'écran, même si la transition se clôt un instant plus tard
  const creating = pending && error === null;
  const disabled = exhausted || creating;
  // L'attente remplace les champs au-dessus du bouton : elle est amenée à l'écran si elle en dépasse (mobile)
  const waitingRef = useRef<HTMLDivElement>(null);
  // Le bouton d'envoi, inactif pendant la création, a perdu le focus : à la réponse, il revient dans
  // la carte — sur le sujet à corriger après un refus, sinon sur le titre (la fenêtre du contenu
  // créé s'ouvre ensuite, et y ramène à sa fermeture).
  const wasCreating = useRef(false);
  useEffect(() => {
    if (creating) waitingRef.current?.scrollIntoView({ block: "nearest" });
    if (wasCreating.current && !creating && document.activeElement === document.body) {
      document.getElementById(error ? "social-topic" : "demande-sur-mesure-titre")?.focus({ preventScroll: true });
    }
    wasCreating.current = creating;
  }, [creating, error]);
  // Message métier plutôt que l'info-bulle native du navigateur
  const dateOutOfRange = date !== "" && (date < dates.min || date > dates.max);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (dateOutOfRange) return;
    setError(null);
    setCreated(null);
    setSentTopic(topic.trim());
    const accentColor = choice === "auto" ? null : choice === "other" ? customHex : choice;
    const scheduledFor = date;
    startTransition(async () => {
      const result = await requestSocialPost({ topic, format, accentColor, scheduledFor });
      if (result.error || !result.postId) {
        setError(result.error ?? "La création a échoué — réessayez dans un instant.");
        return;
      }
      setTopic("");
      setCreated({ postId: result.postId, date: scheduledFor });
      router.refresh();
      onCreated(result.postId, scheduledFor);
    });
  }

  function pickIdea(idea: string) {
    setError(null);
    setTopic(idea);
    // Le curseur va dans le champ : le sujet proposé se complète ou se corrige aussitôt
    document.getElementById("social-topic")?.focus();
  }

  return (
    <Card
      as="section"
      variant="tinted"
      id="demande-sur-mesure"
      aria-labelledby="demande-sur-mesure-titre"
      className="scroll-mt-24"
    >
      <div className="flex items-start gap-3.5">
        <IconBadge icon={CustomIcon} size="md" />
        <div className="min-w-0">
          <h2
            id="demande-sur-mesure-titre"
            tabIndex={-1}
            className="rounded font-ds-display text-lg/7 font-bold text-ds-section-ink ds-focus sm:text-xl/7"
          >
            Demander un contenu sur mesure
          </h2>
          <p className="mt-0.5 text-ds-body text-ds-ink-700">
            Un sujet qui vous tient à cœur, une couleur, un format : Harmony s&apos;appuie sur votre
            site pour le préparer.
          </p>
        </div>
      </div>

      {exhausted ? (
        <div className="mt-5 flex items-start gap-3 rounded-ds-md bg-white p-4 ring-1 ring-ds-section-line">
          <Info size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
          <p className="min-w-0 text-ds-body text-ds-ink-700">
            Vous avez utilisé vos {SOCIAL_REQUESTS_PER_MONTH} demandes {ofMonthFr(todayIso)}. Elles se
            renouvellent le 1er {monthNameFr(usage.resetsOn)}. Vos contenus du calendrier restent
            disponibles.
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5">
        {creating ? (
          <div
            ref={waitingRef}
            className="scroll-mt-24 rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-900/5 ds-fade-in sm:p-5"
          >
            <GenerationProgress
              title={
                sentTopic
                  ? `Harmony prépare votre contenu${NBSP}: «${NBSP}${sentTopic}${NBSP}»`
                  : "Harmony prépare votre contenu"
              }
              steps={REQUEST_STEPS}
              running
              estimate="10 à 30 secondes"
              hint="Ne fermez pas la page : votre contenu s'ouvrira dès qu'il sera prêt."
            />
          </div>
        ) : null}

        {/* Les champs restent montés pendant la création : leur saisie est conservée si elle échoue */}
        <div hidden={creating} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="sm:col-span-2 xl:col-span-1">
            <Label htmlFor="social-topic">Sur quel sujet ? *</Label>
            <Input
              id="social-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex. : le sommeil avant la rentrée, une idée reçue sur l'hypnose…"
              maxLength={200}
              required
              minLength={3}
              disabled={disabled}
              className={FIELD_CLASS}
            />
            <FieldHint>Plus c&apos;est précis, mieux c&apos;est. Vous pouvez citer une de vos spécialités.</FieldHint>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-ds-meta font-semibold text-ds-section-ink">
                <Lightbulb size={15} aria-hidden />
                Des idées :
              </span>
              {TOPIC_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickIdea(idea)}
                  className="inline-flex min-h-9 items-center rounded-full bg-white px-3.5 py-1 text-left text-sm font-medium text-ds-brand-800 inset-ring inset-ring-ds-section-line ds-focus ds-press hover:bg-ds-section-tint-2 disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="social-format">Format</Label>
            <div className="flex items-center gap-2.5">
              <FormatTile format={format} size="md" />
              <Select
                id="social-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as SocialFormat)}
                disabled={disabled}
                className={clsx(FIELD_CLASS, "min-w-0")}
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="social-date">Pour quel jour ?</Label>
            <Input
              id="social-date"
              type="date"
              value={date}
              min={dates.min}
              max={dates.max}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={disabled}
              aria-invalid={dateOutOfRange || undefined}
              aria-describedby="social-date-hint"
              className={FIELD_CLASS}
            />
            <p
              id="social-date-hint"
              className={clsx("mt-1 text-xs", dateOutOfRange ? "font-medium text-ds-danger-700" : "text-ds-ink-600")}
            >
              {dateOutOfRange
                ? `Choisissez une date entre le ${formatDayFr(dates.min, "day")} et le ${formatDayFr(dates.max, "day")}.`
                : "Vous pourrez le changer ensuite."}
            </p>
          </div>

          <div className="sm:col-span-2 xl:col-span-1">
            <fieldset disabled={disabled}>
              <legend className="mb-1.5 block text-sm font-medium text-ink-700">Couleur dominante</legend>
              <div className="flex flex-wrap items-center gap-2.5">
                <ColorOption
                  label="Automatique"
                  value="auto"
                  checked={choice === "auto"}
                  onSelect={() => setChoice("auto")}
                  text
                />
                {swatches.map((swatch) => (
                  <ColorOption
                    key={swatch.label}
                    label={swatch.label}
                    value={swatch.hex}
                    hex={swatch.hex}
                    checked={choice === swatch.hex}
                    onSelect={() => setChoice(swatch.hex as `#${string}`)}
                  />
                ))}
                <ColorOption
                  label="Autre"
                  value="other"
                  checked={choice === "other"}
                  onSelect={() => setChoice("other")}
                  text
                />
              </div>
            </fieldset>
            {choice === "other" ? (
              <div className="mt-3 flex items-center gap-2.5">
                <Label htmlFor="social-color-custom" className="mb-0">
                  Couleur personnalisée
                </Label>
                <input
                  id="social-color-custom"
                  type="color"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  disabled={disabled}
                  className="h-11 w-14 cursor-pointer rounded-xl border border-ink-300 bg-white p-1 disabled:cursor-not-allowed"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button
            type="submit"
            variant={secondaryAction ? "secondary" : "primary"}
            icon={<Sparkles size={18} aria-hidden />}
            loading={creating}
            disabled={disabled || dateOutOfRange || topic.trim().length < 3}
          >
            Créer ce contenu
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <ProgressRing
              value={usage.remaining}
              max={SOCIAL_REQUESTS_PER_MONTH}
              label="Demandes sur mesure restantes ce mois-ci"
              valueText={`${usage.remaining} sur ${SOCIAL_REQUESTS_PER_MONTH}`}
              size={44}
              thickness={5}
            >
              <span className="text-ds-body font-bold text-ds-section-ink ds-tnum">{usage.remaining}</span>
            </ProgressRing>
            {exhausted ? (
              <Badge tone="danger" icon={Info}>
                Quota atteint
              </Badge>
            ) : (
              <p className="min-w-0 text-ds-body text-ds-ink-700">
                Il vous reste <strong className="font-semibold text-ds-ink-900">{usage.remaining}</strong> demande
                {usage.remaining > 1 ? "s" : ""} <span className="whitespace-nowrap">ce mois-ci.</span>
              </p>
            )}
          </div>
        </div>

        {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
        {created && created.date.slice(0, 7) !== monthParam ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <InlineSuccess>Votre contenu est prêt.</InlineSuccess>
            <LinkButton
              href={`/reseaux-sociaux?mois=${created.date.slice(0, 7)}`}
              variant="quiet"
              size="sm"
              iconRight={<ArrowRight size={16} aria-hidden />}
            >
              Voir le {formatDayFr(created.date, "day")}
            </LinkButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

/** Une couleur claire porte une coche foncée, une couleur foncée une coche blanche. */
function isLightColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return true;
  const value = parseInt(match[1], 16);
  const luma = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  return luma > 150;
}

/**
 * Pastille de couleur : vrai bouton radio (clavier et lecteur d'écran natifs,
 * flèches pour changer d'option) rendu `sr-only` sous une étiquette stylée.
 * L'option choisie porte un anneau et une coche, pas seulement sa couleur.
 */
function ColorOption({
  label,
  value,
  hex,
  checked,
  onSelect,
  text,
}: {
  label: string;
  value: string;
  hex?: string;
  checked: boolean;
  onSelect: () => void;
  /** Option textuelle (« Automatique », « Autre ») */
  text?: boolean;
}) {
  return (
    <label
      title={label}
      className={clsx(
        "relative flex cursor-pointer items-center justify-center rounded-full",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ds-brand-600",
        text
          ? "min-h-10 gap-1.5 bg-white px-3.5 text-sm font-medium text-ds-ink-800 pointer-coarse:min-h-11"
          : "size-10 pointer-coarse:size-11",
        checked
          ? "ring-2 ring-ds-brand-600 ring-offset-2 ring-offset-ds-section-tint"
          : text
            ? "inset-ring inset-ring-ds-ink-300"
            : "inset-ring inset-ring-ds-ink-900/20",
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      <input
        type="radio"
        name="social-color"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {checked ? (
        <Check
          size={text ? 16 : 18}
          strokeWidth={3}
          aria-hidden
          className={clsx(text ? "text-ds-brand-700" : hex && !isLightColor(hex) ? "text-white" : "text-ds-ink-900")}
        />
      ) : null}
      {text ? label : <span className="sr-only">{label}</span>}
    </label>
  );
}
