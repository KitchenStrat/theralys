import { Card } from "@theralys/ui";

export const metadata = { title: "Leads" };

/** Placeholder — le suivi des leads arrive en Phase 4. */
export default function LeadsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Leads</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">Bientôt disponible</p>
        <p className="mt-1 text-sm">
          Le suivi des prospects (démos envoyées, pipeline de vente) arrive dans une prochaine
          phase.
        </p>
      </Card>
    </div>
  );
}
