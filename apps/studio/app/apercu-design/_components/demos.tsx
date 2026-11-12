"use client";

import { CalendarDays, LayoutGrid, RotateCcw, Save, Settings, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Badge as SharedBadge,
  Button as SharedButton,
  Card as SharedCard,
  FieldHint,
  Input,
  Label,
  Modal,
  Segmented,
  Select,
} from "@theralys/ui";
import { Badge, Button, InlineSuccess, SECTIONS, SECTION_ORDER, TabPanel, Tabs } from "@/components/ds";

/** Remonte son contenu à chaque clic : les animations d'entrée rejouent. */
export function Replay({ children, label = "Rejouer l'animation" }: { children: ReactNode; label?: string }) {
  const [run, setRun] = useState(0);
  return (
    <div>
      <div key={run}>{children}</div>
      <Button
        variant="quiet"
        size="sm"
        className="mt-3"
        icon={<RotateCcw size={16} aria-hidden />}
        onClick={() => setRun((n) => n + 1)}
      >
        {label}
      </Button>
    </div>
  );
}

/** Onglets de page (trait qui glisse) et leur panneau. */
export function TabsDemo() {
  const [tab, setTab] = useState("mois");
  const tabs = [
    { id: "mois", label: "Ce mois-ci", icon: LayoutGrid, badge: <Badge tone="section" className="px-2 py-0.5">8</Badge> },
    { id: "calendrier", label: "Calendrier", icon: CalendarDays },
    { id: "mesure", label: "Sur mesure", icon: Sparkles },
    { id: "reglages", label: "Réglages", icon: Settings },
  ];
  return (
    <div>
      <Tabs idBase="demo-onglets" label="Exemple d'onglets de page" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel key={tab} idBase="demo-onglets" tab={tab} className="mt-4 text-ds-body text-ds-ink-600">
        Panneau « {tabs.find((item) => item.id === tab)?.label} » : le contenu arrive en fondu, le trait en dégradé glisse
        sous l'onglet. Au clavier : flèches gauche et droite, Début, Fin.
      </TabPanel>
    </div>
  );
}

/** Sélecteur à segments (pastille qui glisse). */
export function SegmentedDemo() {
  const [period, setPeriod] = useState("30j");
  return (
    <Tabs
      variant="pill"
      idBase="demo-periode"
      label="Exemple de sélecteur de période"
      value={period}
      onChange={setPeriod}
      tabs={[
        { id: "7j", label: "7 jours" },
        { id: "30j", label: "30 jours" },
        { id: "6m", label: "6 mois" },
      ]}
    />
  );
}

/** Bouton : état de chargement (2 s), puis confirmation discrète. */
export function SaveDemo() {
  const [state, setState] = useState<"repos" | "envoi" | "fait">("repos");
  useEffect(() => {
    if (state !== "envoi") return;
    const id = window.setTimeout(() => setState("fait"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button icon={<Save size={18} aria-hidden />} loading={state === "envoi"} onClick={() => setState("envoi")}>
        Enregistrer
      </Button>
      {state === "fait" ? <InlineSuccess>Modifications enregistrées</InlineSuccess> : null}
    </div>
  );
}

const toHex = (color: string): string | null => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};

const close = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2);

/**
 * Garde-fou : les couleurs du registre (TypeScript) et celles de `globals.css`
 * doivent concorder. Compare, pour chaque section, le dégradé et la teinte.
 */
export function RegistryCheck() {
  const [gaps, setGaps] = useState<string[] | null>(null);
  useEffect(() => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const found: string[] = [];
    for (const key of SECTION_ORDER) {
      probe.setAttribute("data-ds-section", key);
      const style = getComputedStyle(probe);
      const def = SECTIONS[key];
      const pairs: [string, string, string][] = [
        ["--ds-s-from", def.gradient.from, "dégradé (départ)"],
        ["--ds-s-to", def.gradient.to, "dégradé (arrivée)"],
        ["--ds-s-deep-from", def.gradient.deepFrom, "dégradé profond (départ)"],
        ["--ds-s-deep-to", def.gradient.deepTo, "dégradé profond (arrivée)"],
        ["--ds-s-tint", def.tint.soft, "teinte"],
        ["--ds-s-ink", def.tint.ink, "encre"],
        ["--ds-s-accent", def.tint.accent, "accent"],
      ];
      for (const [variable, expected, name] of pairs) {
        const hex = toHex(style.getPropertyValue(variable).trim());
        if (!hex || !close(hex, expected)) found.push(`${def.label} — ${name} : registre ${expected}, CSS ${hex ?? "?"}`);
      }
    }
    probe.remove();
    // Lecture du DOM après montage : l'état ne peut être connu qu'ici
    setGaps(found);
  }, []);

  if (gaps === null) return <p className="text-ds-meta text-ds-ink-600">Vérification du registre…</p>;
  if (gaps.length === 0) {
    return <InlineSuccess>Registre et feuille de style concordent pour les neuf sections</InlineSuccess>;
  }
  return (
    <div role="alert" className="rounded-ds-sm bg-ds-danger-100 p-3 text-ds-body text-ds-danger-900">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert size={18} aria-hidden /> Le registre et la feuille de style divergent :
      </p>
      <ul className="mt-1 list-disc pl-6">
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
    </div>
  );
}

const SHARED_TONES = [
  ["neutral", "Brouillon"],
  ["primary", "Planifié"],
  ["info", "En cours"],
  ["success", "Publié"],
  ["warning", "À relire"],
  ["danger", "À reprendre"],
] as const;

/**
 * Les composants PARTAGÉS (packages/ui), non modifiés, rendus sous la coquille :
 * les jetons hérités y prennent leurs valeurs AA (bloc 5 de globals.css). Sert de
 * témoin au plan de bascule — et la fenêtre vérifie qu'aucun ancêtre ne la retient.
 */
export function SharedComponentsDemo() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"carre" | "portrait" | "paysage">("carre");
  const close = () => setOpen(false);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <SharedCard className="p-6">
        <p className="text-sm font-semibold text-ink-900">Boutons, badges et textes</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SharedButton>Enregistrer</SharedButton>
          <SharedButton variant="secondary">Annuler</SharedButton>
          <SharedButton variant="ghost">Plus tard</SharedButton>
          <SharedButton variant="danger">Supprimer</SharedButton>
          <SharedButton disabled>Indisponible</SharedButton>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SHARED_TONES.map(([tone, label]) => (
            <SharedBadge key={tone} tone={tone}>
              {label}
            </SharedBadge>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-500">
          Texte secondaire en <code>text-ink-500</code> : 360 emplois dans le studio, 4,2:1 aujourd'hui.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#herites" className="font-medium text-primary-600 hover:underline">
            Un lien
          </a>
          <span className="text-success-500">Modifications enregistrées</span>
          <span className="text-danger-500">Adresse e-mail invalide</span>
          <span className="text-warning-500">Quota presque atteint</span>
          <span className="text-info-500">Mise à jour en cours</span>
        </p>
      </SharedCard>
      <SharedCard className="p-6">
        <p className="text-sm font-semibold text-ink-900">Champs et fenêtre</p>
        <div className="mt-3">
          <Label htmlFor="demo-partage-nom">Nom du cabinet</Label>
          <Input id="demo-partage-nom" placeholder="Cabinet d'ostéopathie" />
          <FieldHint>Affiché en haut de votre site.</FieldHint>
        </div>
        <div className="mt-3">
          <Label htmlFor="demo-partage-ton">Ton des textes</Label>
          <Select id="demo-partage-ton" defaultValue="chaleureux">
            <option value="chaleureux">Chaleureux</option>
            <option value="sobre">Sobre</option>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmented
            aria-label="Format du visuel"
            options={[
              { value: "carre", label: "Carré" },
              { value: "portrait", label: "Portrait" },
              { value: "paysage", label: "Paysage" },
            ]}
            value={format}
            onChange={setFormat}
          />
          <SharedButton variant="secondary" onClick={() => setOpen(true)}>
            Ouvrir une fenêtre
          </SharedButton>
        </div>
      </SharedCard>
      <Modal
        open={open}
        onClose={close}
        title="Fenêtre partagée"
        footer={
          <>
            <SharedButton variant="secondary" onClick={close}>
              Fermer
            </SharedButton>
            <SharedButton onClick={close}>Valider</SharedButton>
          </>
        }
      >
        <p className="text-sm text-ink-500">
          La fenêtre couvre tout l'écran, barres de navigation comprises : dans la coquille, aucun ancêtre ne la retient.
        </p>
      </Modal>
    </div>
  );
}
