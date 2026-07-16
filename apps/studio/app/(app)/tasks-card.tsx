"use client";

import Link from "next/link";
import { useTransition } from "react";
import { clsx } from "clsx";
import { Card } from "@theralys/ui";
import type { OnboardingTask } from "@theralys/db";
import { completeOnboardingTask } from "./actions";

const TASK_META: Record<string, { label: string; href: string }> = {
  connect_google: { label: "Connecter votre fiche Google", href: "/#visibilite" },
  verify_pages: { label: "Vérifier vos pages secondaires", href: "/editor" },
  publish_site: { label: "Publier votre site", href: "/editor" },
  activate_blog: { label: "Activer votre blog", href: "/publications" },
};

export function TasksCard({ tasks }: { tasks: OnboardingTask[] }) {
  const [, startTransition] = useTransition();
  const tour = tasks.find((t) => t.key === "guided_tour");
  const checklist = tasks.filter((t) => t.key !== "guided_tour");
  const doneCount = checklist.filter((t) => t.done).length;

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Vos tâches</h2>

      {tour ? (
        <button
          type="button"
          onClick={() => startTransition(() => void completeOnboardingTask("guided_tour"))}
          className={clsx(
            "mt-4 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
            tour.done
              ? "border-cream-300 bg-cream-100"
              : "border-primary-300 bg-primary-50 hover:border-primary-400",
          )}
        >
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-500 shadow-sm"
          >
            ▶
          </span>
          <span>
            <span className="block text-sm font-semibold">Visite guidée</span>
            <span className="block text-xs text-ink-500">2 minutes pour découvrir Harmony</span>
          </span>
        </button>
      ) : null}

      <ul className="mt-4 space-y-1">
        {checklist.map((task) => {
          const meta = TASK_META[task.key] ?? { label: task.key, href: "/" };
          return (
            <li key={task.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className={clsx(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                    task.done ? "bg-success-500 text-white" : "border-2 border-ink-300 text-transparent",
                  )}
                >
                  ✓
                </span>
                <span className={clsx(task.done && "text-ink-500 line-through")}>{meta.label}</span>
              </span>
              <Link
                href={meta.href}
                className="shrink-0 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
              >
                {task.done ? "Revoir ↗" : "Faire ↗"}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
          <div
            className="h-full rounded-full bg-primary-500 transition-all"
            style={{ width: `${checklist.length ? (doneCount / checklist.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs font-medium text-ink-500">
          {doneCount} / {checklist.length}
        </span>
      </div>
    </Card>
  );
}
