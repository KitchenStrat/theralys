"use client";

import { ChartLine } from "lucide-react";
import { useState } from "react";
import { AreaChart, Card, CardHeader, Tabs, formatNumber, type AreaChartDatum } from "@/components/ds";

type Period = "7j" | "30j";

/** Carte « Visites de votre site » : sélecteur de période à pastille glissante et graphique en aire. */
export function VisitsCard({ week, month }: { week: readonly AreaChartDatum[]; month: readonly AreaChartDatum[] }) {
  const [period, setPeriod] = useState<Period>("30j");
  const data = period === "7j" ? week : month;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const span = period === "7j" ? "7 jours" : "30 jours";
  return (
    <Card section="mon-site">
      <CardHeader
        icon={ChartLine}
        title="Visites de votre site"
        description={`${formatNumber(total)} visites sur ${span}`}
        action={
          <Tabs
            variant="pill"
            idBase="visites"
            label="Période affichée"
            value={period}
            onChange={setPeriod}
            tabs={[
              { id: "7j", label: "7 jours" },
              { id: "30j", label: "30 jours" },
            ]}
          />
        }
      />
      <div id={`visites-panel-${period}`} role="tabpanel" aria-labelledby={`visites-tab-${period}`} className="mt-6">
        <AreaChart key={period} data={data} unit={["visite", "visites"]} label={`Visites de votre site sur ${span}`} />
      </div>
    </Card>
  );
}
