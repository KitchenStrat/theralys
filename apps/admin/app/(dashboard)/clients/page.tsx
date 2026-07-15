import { Card } from "@theralys/ui";

export const metadata = { title: "Clients" };

/** Placeholder — la gestion des clients arrive en Phase 4. */
export default function ClientsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Clients</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">Bientôt disponible</p>
        <p className="mt-1 text-sm">
          La gestion des sites clients (abonnements, impersonation, santé du blog) arrive dans une
          prochaine phase.
        </p>
      </Card>
    </div>
  );
}
