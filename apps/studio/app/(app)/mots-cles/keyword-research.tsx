"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, FieldHint, Input, Label } from "@theralys/ui";

/*
 * Générateur de mots-clés SEO : croise le(s) métier(s), la ville et les
 * spécialités du praticien avec les intentions de recherche réelles des
 * patients (proximité, avis, tarif, prise de rendez-vous…) pour proposer
 * 15 expressions à intégrer dans les pages du site.
 */

type Suggestion = { keyword: string; type: string };

const TYPE_TONES: Record<string, "primary" | "success" | "info" | "warning" | "neutral"> = {
  "Recherche locale": "primary",
  "Prise de RDV": "success",
  "Spécialité": "info",
  "Réputation": "warning",
  "Tarifs": "neutral",
  "Générique": "neutral",
};

function splitList(raw: string): string[] {
  return raw
    .split(/[,;/\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function generateKeywords(
  professionsRaw: string,
  cityRaw: string,
  specialtiesRaw: string,
): Suggestion[] {
  const professions = splitList(professionsRaw);
  const specialties = splitList(specialtiesRaw);
  const city = cityRaw.trim().toLowerCase();
  if (professions.length === 0 || !city) return [];
  // Élision : « près d'Albi » plutôt que « près de Albi »
  const deCity = /^[aeiouyàâéèêëîïôöûüh]/.test(city) ? `d'${city}` : `de ${city}`;

  const out: Suggestion[] = [];
  const push = (keyword: string, type: string) => {
    const clean = keyword.replace(/\s+/g, " ").trim();
    if (clean && !out.some((s) => s.keyword === clean) && out.length < 15) {
      out.push({ keyword: clean, type });
    }
  };

  // 1. Le socle local : c'est ce que tapent 80 % des patients
  for (const p of professions) {
    push(`${p} ${city}`, "Recherche locale");
    push(`cabinet ${p} ${city}`, "Recherche locale");
  }
  // 2. Les intentions fortes : rendez-vous, avis, tarifs
  for (const p of professions) {
    push(`prendre rendez-vous ${p} ${city}`, "Prise de RDV");
    push(`${p} ${city} avis`, "Réputation");
    push(`meilleur ${p} ${city}`, "Réputation");
    push(`${p} ${city} tarif`, "Tarifs");
  }
  // 3. Les spécialités : les recherches « symptôme » qui amènent de
  //    nouveaux patients (plafonnées pour garder un mix équilibré)
  for (const s of specialties.slice(0, 5)) {
    push(`${s} ${city}`, "Spécialité");
  }
  for (const s of specialties.slice(0, 2)) {
    if (professions[0]) push(`${professions[0]} ${s}`, "Spécialité");
  }
  // 4. Compléments locaux puis génériques pour atteindre 15 quoi qu'il arrive
  for (const p of professions) {
    push(`consultation ${p} ${city}`, "Recherche locale");
    push(`${p} près ${deCity}`, "Recherche locale");
    push(`séance ${p} ${city}`, "Prise de RDV");
    push(`rdv ${p} en ligne ${city}`, "Prise de RDV");
  }
  for (const s of specialties.slice(5)) {
    push(`${s} ${city}`, "Spécialité");
  }
  push(`thérapeute ${city}`, "Générique");
  push(`médecine douce ${city}`, "Générique");
  push(`bien-être ${city}`, "Générique");
  for (const p of professions) push(`${p} proche de chez moi`, "Générique");

  return out;
}

export function KeywordResearchCard({
  defaultProfession,
  defaultCity,
  defaultSpecialties,
}: {
  defaultProfession: string;
  defaultCity: string;
  defaultSpecialties: string;
}) {
  const [professions, setProfessions] = useState(defaultProfession);
  const [city, setCity] = useState(defaultCity);
  const [specialties, setSpecialties] = useState(defaultSpecialties);
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopied(false);
    setResults(generateKeywords(professions, city, specialties));
  }

  async function copyAll() {
    if (!results) return;
    try {
      await navigator.clipboard.writeText(results.map((r) => r.keyword).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : on n'affiche simplement pas la confirmation
    }
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-cream-200 text-sm"
        >
          🔎
        </span>
        Trouver les bons mots-clés
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        <strong className="text-ink-700">Comment ça marche&nbsp;?</strong> Le module croise
        votre métier, votre ville et vos spécialités avec les intentions de recherche
        réelles des patients sur Google (proximité, avis, tarifs, prise de rendez-vous…)
        et vous propose 15 expressions à placer dans les titres et les textes de votre
        site pour améliorer votre référencement.
      </p>

      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="kw-professions">Votre ou vos métiers *</Label>
          <Input
            id="kw-professions"
            required
            value={professions}
            onChange={(e) => setProfessions(e.target.value)}
            placeholder="Sophrologue, hypnothérapeute…"
          />
          <FieldHint>Plusieurs métiers ? Séparez-les par une virgule.</FieldHint>
        </div>
        <div>
          <Label htmlFor="kw-city">Votre ville *</Label>
          <Input
            id="kw-city"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Albi"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="kw-specialties">Vos spécialités (facultatif)</Label>
          <Input
            id="kw-specialties"
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            placeholder="Gestion du stress, sommeil, confiance en soi…"
          />
          <FieldHint>
            Les motifs de consultation que vos patients recherchent, séparés par des virgules.
          </FieldHint>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Générer mes 15 mots-clés</Button>
        </div>
      </form>

      {results !== null ? (
        results.length > 0 ? (
          <div className="mt-6 border-t border-cream-200 pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-900">
                {results.length} mots-clés recommandés pour votre site
              </h3>
              <Button type="button" variant="secondary" size="sm" onClick={copyAll}>
                {copied ? "✓ Copié !" : "Copier la liste"}
              </Button>
            </div>
            <ol className="mt-3 divide-y divide-cream-200">
              {results.map((r, i) => (
                <li key={r.keyword} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-300">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium text-ink-900">{r.keyword}</span>
                  </span>
                  <Badge tone={TYPE_TONES[r.type] ?? "neutral"} className="shrink-0">
                    {r.type}
                  </Badge>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-ink-500">
              💡 Utilisez ces expressions dans vos titres de pages, vos textes et vos articles
              de blog. Avec la formule Boost, le blog automatisé s&apos;en charge pour vous.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-danger-500">
            Indiquez au moins un métier et votre ville pour générer des suggestions.
          </p>
        )
      ) : null}
    </Card>
  );
}
