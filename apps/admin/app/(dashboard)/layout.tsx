import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { destroySession, requireAdmin } from "@/lib/auth";
import { NavTabs } from "./nav-tabs";

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/70 shadow-[0_1px_0_rgb(12_74_110/0.05)] backdrop-blur-xl">
        {/* Sous 1024 px, la navigation passe sur une seconde ligne et défile dans sa largeur : jamais de défilement horizontal de la page */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-1 px-4 py-3">
          <Link
            href="/"
            className="order-1 bg-gradient-to-r from-primary-700 via-primary-500 to-primary-400 bg-clip-text text-xl font-bold text-transparent"
          >
            Harmony
          </Link>
          <div className="order-3 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
            <NavTabs />
          </div>
          <form action={logoutAction} className="order-2 ml-auto flex items-center gap-3 lg:order-3">
            <span className="hidden text-sm text-ink-500 sm:block">{user.name}</span>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-ink-700 transition-colors hover:bg-cream-200"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
