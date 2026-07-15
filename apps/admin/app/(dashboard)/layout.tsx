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
      <header className="sticky top-0 z-40 border-b border-cream-300 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
          <div className="flex items-center gap-8">
            <Link href="/demos" className="text-xl font-bold text-primary-500">
              Theralys
            </Link>
            <NavTabs />
          </div>
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-500 sm:block">{user.name}</span>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-ink-700 hover:bg-cream-200"
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
