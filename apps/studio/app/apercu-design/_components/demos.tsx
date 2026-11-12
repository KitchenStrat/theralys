"use client";

import { CalendarDays, LayoutGrid, RotateCcw, Save, Settings, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
