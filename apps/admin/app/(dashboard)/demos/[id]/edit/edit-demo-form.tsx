"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, ProgressDots, Select, Spinner } from "@theralys/ui";
import { regenerateDemo, updateDemo } from "../../actions";
import { ConvertModal } from "./convert-modal";

type DemoData = {
  siteId: string;
  slug: string;
  status: "generating" | "ready" | "error" | "published" | "archived";
  progress: { home: boolean; motifs: boolean; reviews: boolean; articles: boolean };
  generationError: string | null;
  url: string;
  linkActive: boolean;
  demoExpiresAt: string | null;
  plan: string;
  themePreset: "terracotta" | "sauge" | "ocean" | "lavande" | "ambre";
  bookingUrl: string;
  highlightedMotifs: string[];
  firstName: string;
  lastName: string;
  profession: string;
  city: string;
  gender: "feminin" | "masculin";
  googleBusinessName: string | null;
};

const THEME_LABELS = {
  terracotta: "Terracotta",
  sauge: "Sauge",
  ocean: "Océan",
  lavande: "Lavande",
  ambre: "Ambre",
} as const;

export function EditDemoForm({ demo }: { demo: DemoData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [motifs, setMotifs] = useState(demo.highlightedMotifs);
  const [motifInput, setMotifInput] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const generating = demo.status === "generating";
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [generating, router]);

  const remainingDays = demo.demoExpiresAt
    ? Math.max(0, Math.ceil((new Date(demo.demoExpiresAt).getTime() - Date.now()) / 86_400_000))
    : 30;

  function addMotif() {
    const value = motifInput.trim();
    if (!value || motifs.includes(value) || motifs.length >= 12) return;
    setMotifs([...motifs, value]);
    setMotifInput("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const result = await updateDemo({
      siteId: demo.siteId,
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      profession: form.get("profession"),
      city: form.get("city"),
      gender: form.get("gender"),
      language: "fr",
      highlightedMotifs: motifs,
      bookingUrl: form.get("bookingUrl") ?? "",
      validityDays: form.get("validityDays") || 30,
      themePreset: form.get("themePreset"),
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link href="/demos" className="text-ink-500 hover:text-ink-900">
          ← Retour aux démos
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {demo.firstName} {demo.lastName}
        </h1>
        <div className="flex items-center gap-3">
          <StatusBadge status={demo.status} />
          <Button
            size="sm"
            disabled={demo.status !== "ready"}
            title={demo.status !== "ready" ? "La génération doit être terminée" : undefined}
            onClick={() => setConvertOpen(true)}
          >
            Convertir en site client
          </Button>
        </div>
      </div>
      <ConvertModal siteId={demo.siteId} open={convertOpen} onClose={() => setConvertOpen(false)} />
      {demo.googleBusinessName ? (
        <p className="mt-1 text-sm text-ink-500">Fiche Google : {demo.googleBusinessName}</p>
      ) : null}

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-700">Lien de la démo</p>
            <a
              href={demo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-primary-600 underline"
            >
              {demo.url}
            </a>
            <p className="mt-1 text-xs text-ink-500">
              {demo.linkActive
                ? `Lien actif · expire dans ${remainingDays} jour${remainingDays > 1 ? "s" : ""}`
                : "Lien expiré — enregistrez une nouvelle validité pour le réactiver"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(demo.url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? "Copié !" : "Copier le lien"}
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-700">Contenu généré :</span>
            <ProgressDots
              dots={[
                { label: "Accueil", done: demo.progress.home },
                { label: "Motifs", done: demo.progress.motifs },
                { label: "Avis", done: demo.progress.reviews },
                { label: "Articles", done: demo.progress.articles },
              ]}
            />
            {generating ? <Spinner /> : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={generating || regenerating}
            onClick={() => {
              setRegenerating(true);
              void regenerateDemo(demo.siteId).finally(() => {
                setRegenerating(false);
                router.refresh();
              });
            }}
          >
            {generating || regenerating ? "Génération en cours…" : "Régénérer le contenu"}
          </Button>
        </div>
        {demo.status === "error" && demo.generationError ? (
          <p className="mt-3 rounded-xl bg-danger-100 px-4 py-2 text-sm text-danger-500">
            {demo.generationError}
          </p>
        ) : null}
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="font-semibold">Fiche praticien &amp; réglages</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">Prénom *</Label>
              <Input id="firstName" name="firstName" defaultValue={demo.firstName} required />
            </div>
            <div>
              <Label htmlFor="lastName">Nom *</Label>
              <Input id="lastName" name="lastName" defaultValue={demo.lastName} required />
            </div>
            <div>
              <Label htmlFor="profession">Métier *</Label>
              <Input id="profession" name="profession" defaultValue={demo.profession} required />
            </div>
            <div>
              <Label htmlFor="city">Ville *</Label>
              <Input id="city" name="city" defaultValue={demo.city} required />
            </div>
            <div>
              <Label htmlFor="gender">Genre *</Label>
              <Select id="gender" name="gender" defaultValue={demo.gender}>
                <option value="feminin">Féminin</option>
                <option value="masculin">Masculin</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="themePreset">Thème du site</Label>
              <Select id="themePreset" name="themePreset" defaultValue={demo.themePreset}>
                {Object.entries(THEME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <fieldset>
            <Label htmlFor="motifInput">Motifs à mettre en avant</Label>
            <div className="flex gap-2">
              <Input
                id="motifInput"
                value={motifInput}
                placeholder="ex. Gestion du stress"
                onChange={(e) => setMotifInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMotif();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addMotif}>
                Ajouter
              </Button>
            </div>
            {motifs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {motifs.map((motif) => (
                  <Badge key={motif} tone="primary">
                    {motif}
                    <button
                      type="button"
                      aria-label={`Retirer ${motif}`}
                      onClick={() => setMotifs(motifs.filter((m) => m !== motif))}
                      className="ml-1 opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <FieldHint>
              Les changements de fiche ou de motifs prennent effet sur le site après « Régénérer le
              contenu ».
            </FieldHint>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bookingUrl">Lien de prise de RDV</Label>
              <Input
                id="bookingUrl"
                name="bookingUrl"
                defaultValue={demo.bookingUrl}
                placeholder="https://calendly.com/… ou tel:…"
              />
            </div>
            <div>
              <Label htmlFor="validityDays">Validité du lien (jours à partir de maintenant)</Label>
              <Input
                id="validityDays"
                name="validityDays"
                type="number"
                min={1}
                max={365}
                defaultValue={remainingDays || 30}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-danger-500">{error}</p> : null}
          {saved ? <p className="text-sm text-success-500">Modifications enregistrées.</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: DemoData["status"] }) {
  switch (status) {
    case "generating":
      return (
        <Badge tone="info">
          <Spinner className="h-3 w-3" /> En préparation
        </Badge>
      );
    case "ready":
      return <Badge tone="success">Prête à vérifier</Badge>;
    case "error":
      return <Badge tone="danger">Erreur de génération</Badge>;
    case "published":
      return <Badge tone="success">Publiée</Badge>;
    case "archived":
      return <Badge tone="neutral">Archivée</Badge>;
  }
}
