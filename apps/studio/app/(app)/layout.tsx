import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { destroySession, requireClient } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { StudioNav } from "./studio-nav";

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  return (
    <div className="min-h-screen">
      {session.impersonated ? (
        <div className="flex items-center justify-center gap-3 bg-warning-100 px-4 py-1.5 text-sm text-ink-900">
          <span>
            🛟 Mode support — connecté en tant que <strong>{session.name}</strong>
          </span>
          <form action={logoutAction}>
            <button type="submit" className="font-medium underline underline-offset-2">
              Quitter
            </button>
          </form>
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/70 shadow-[0_1px_0_rgb(12_74_110/0.05)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="bg-gradient-to-r from-primary-700 via-primary-500 to-primary-400 bg-clip-text text-xl font-bold text-transparent"
            >
              Harmony
            </Link>
            <StudioNav />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/editor"
              className="hidden items-center gap-1.5 rounded-full border border-primary-200 bg-white/60 px-4 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 sm:inline-flex"
            >
              ✎ Éditer site
            </Link>
            <a
              href={siteUrl(site)}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full border border-primary-200 bg-white/60 px-4 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 sm:inline-flex"
            >
              ↗ Voir site
            </a>
            <Link
              href="/compte"
              className="ml-1 rounded-full bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-200"
            >
              {session.name.split(" ")[0]}
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Déconnexion"
                aria-label="Déconnexion"
                className="rounded-full px-2 py-1.5 text-sm text-ink-500 transition-colors hover:bg-cream-200"
              >
                ⏻
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
