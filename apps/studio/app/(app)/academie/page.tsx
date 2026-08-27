import { Card } from "@theralys/ui";

export const metadata = { title: "Académie" };

export default function AcademyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Académie</h1>
      <Card className="p-12 text-center">
        <span aria-hidden className="text-4xl">
          🎓
        </span>
        <p className="mt-4 text-lg font-semibold text-ink-900">En construction</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Des formations complètes pour développer votre cabinet — visibilité,
          fidélisation, communication — arrivent bientôt dans cet espace.
        </p>
      </Card>
    </div>
  );
}
