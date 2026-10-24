"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { Button, Card, FieldHint, Input, Label, Select, Spinner } from "@theralys/ui";
import { SOCIAL_REQUESTS_PER_MONTH, type SocialFormat } from "@theralys/shared";
import { formatDayFr, monthNameFr, ofMonthFr } from "@/lib/calendar";
import type { SocialRequestUsage } from "@/lib/social/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { requestSocialPost } from "./actions";

const FORMAT_OPTIONS: { value: SocialFormat; label: string }[] = [
  { value: "static", label: "Statique — 1 visuel" },
  { value: "carousel", label: "Carrousel — plusieurs pages à faire défiler" },
  { value: "story", label: "Story — vertical, 24 h" },
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
}: {
  swatches: SocialSwatch[];
  usage: SocialRequestUsage;
  /** Date par défaut (prochain créneau à pourvoir, bornée), bornes min (demain) et max (+120 j) */
  dates: { default: string; min: string; max: string };
  /** « YYYY-MM » du mois affiché (lien « Voir le … → » si la date en sort) */
  monthParam: string;
  /** Jour civil Europe/Paris */
  todayIso: string;
  onCreated: (postId: string, date: string) => void;
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

  const exhausted = usage.remaining === 0;
  const disabled = exhausted || pending;
  // Message métier plutôt que l'info-bulle native du navigateur
  const dateOutOfRange = date !== "" && (date < dates.min || date > dates.max);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (dateOutOfRange) return;
    setError(null);
    setCreated(null);
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

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600"
        >
          ✦
        </span>
        <h2 className="text-xl font-semibold">Demander un contenu sur mesure</h2>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Un sujet qui vous tient à cœur, une couleur, un format : Harmony s&apos;appuie sur votre
        site pour le préparer.
      </p>

      {exhausted ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Vous avez utilisé vos {SOCIAL_REQUESTS_PER_MONTH} demandes {ofMonthFr(todayIso)}. Elles se
          renouvellent le 1er {monthNameFr(usage.resetsOn)}. Vos contenus du calendrier restent
          disponibles.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
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
          />
          <FieldHint>Plus c&apos;est précis, mieux c&apos;est. Vous pouvez citer une de vos spécialités.</FieldHint>
        </div>

        <div>
          <Label htmlFor="social-format">Format</Label>
          <Select
            id="social-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as SocialFormat)}
            disabled={disabled}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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
          />
          <p
            id="social-date-hint"
            className={clsx("mt-1 text-xs", dateOutOfRange ? "text-danger-500" : "text-ink-500")}
          >
            {dateOutOfRange
              ? `Choisissez une date entre le ${formatDayFr(dates.min, "day")} et le ${formatDayFr(dates.max, "day")}.`
              : "Vous pourrez le changer ensuite."}
          </p>
        </div>

        <div className="sm:col-span-2">
          <fieldset disabled={disabled}>
            <legend className="mb-1 block text-sm font-medium text-ink-700">Couleur dominante</legend>
            <div className="flex flex-wrap items-center gap-2">
              <ColorOption
                label="Automatique"
                value="auto"
                checked={choice === "auto"}
                onSelect={() => setChoice("auto")}
                hatched
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
            <div className="mt-2 flex items-center gap-2">
              <Label htmlFor="social-color-custom" className="mb-0">
                Couleur personnalisée
              </Label>
              <input
                id="social-color-custom"
                type="color"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                disabled={disabled}
                className="h-8 w-12 cursor-pointer rounded-lg border border-ink-300 bg-white p-0.5"
              />
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={disabled || dateOutOfRange || topic.trim().length < 3}>
            {pending ? (
              <>
                <Spinner className="text-white" /> Création en cours… (10 à 30 secondes)
              </>
            ) : (
              "Créer ce contenu"
            )}
          </Button>
          {!exhausted ? (
            <p className="text-sm text-ink-500">
              Il vous reste <strong>{usage.remaining}</strong> demande
              {usage.remaining > 1 ? "s" : ""} ce mois-ci.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="sm:col-span-2 text-sm text-danger-500" role="alert">
            {error}
          </p>
        ) : null}
        {created && created.date.slice(0, 7) !== monthParam ? (
          <p className="sm:col-span-2 text-sm text-ink-700">
            Votre contenu est prêt.{" "}
            <Link
              href={`/reseaux-sociaux?mois=${created.date.slice(0, 7)}`}
              className="font-medium text-primary-600 hover:underline"
            >
              Voir le {formatDayFr(created.date, "day")} →
            </Link>
          </p>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * Pastille de couleur : vrai bouton radio (clavier et lecteur d'écran natifs,
 * flèches pour changer d'option) rendu `sr-only` sous une étiquette stylée.
 */
function ColorOption({
  label,
  value,
  hex,
  checked,
  onSelect,
  hatched,
  text,
}: {
  label: string;
  value: string;
  hex?: string;
  checked: boolean;
  onSelect: () => void;
  /** Pastille hachurée (« Automatique ») */
  hatched?: boolean;
  /** Option textuelle (« Autre ») */
  text?: boolean;
}) {
  return (
    <label
      title={label}
      className={clsx(
        "relative flex cursor-pointer items-center justify-center rounded-full border border-cream-300 transition-shadow",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500",
        text ? "h-8 px-3 text-sm font-medium text-ink-700" : "h-8 w-8",
        checked && "ring-2 ring-primary-400 ring-offset-1",
      )}
      style={
        hex
          ? { backgroundColor: hex }
          : hatched
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, #d3e3ef 0 3px, #ffffff 3px 7px)",
              }
            : undefined
      }
    >
      <input
        type="radio"
        name="social-color"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {text ? label : <span className="sr-only">{label}</span>}
    </label>
  );
}
