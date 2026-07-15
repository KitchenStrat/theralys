import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Theralys — Sites de praticiens",
  robots: { index: false, follow: false },
};

/** Racine de l'hôte de démos : rien à indexer ni à afficher. */
export default function RootPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">Theralys</h1>
        <p className="mt-2 opacity-70">
          Les sites de démonstration sont accessibles via leur lien dédié.
        </p>
      </div>
    </main>
  );
}
