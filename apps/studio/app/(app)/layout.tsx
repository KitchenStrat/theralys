import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hasBlog } from "@theralys/db";
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
  const firstName = session.name.split(" ")[0] ?? session.name;

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

      <div className="md:flex">
        {/* Barre latérale : logo, navigation, accès au site et au compte */}
        <aside className="flex flex-col border-b border-cream-200 bg-white/75 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:w-[230px] md:shrink-0 md:border-b-0 md:border-r">
          <div className="px-5 py-5">
            <Link
              href="/"
              className="bg-gradient-to-r from-primary-700 via-primary-500 to-primary-400 bg-clip-text text-xl font-bold text-transparent"
            >
              Harmony
            </Link>
          </div>

          <StudioNav showPublications={site.type === "demo" || hasBlog(site.plan)} />

          <div className="border-t border-cream-200 p-3 md:mt-auto">
            <a
              href={siteUrl(site)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              ↗ Voir mon site
            </a>
            <div className="mt-1 flex items-center justify-between gap-2 px-1">
              <Link
                href="/compte"
                className="rounded-full bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-200"
              >
                {firstName}
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
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
