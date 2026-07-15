"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, ProgressDots, Spinner } from "@theralys/ui";
import { relativeTimeFr } from "@theralys/shared";
import { duplicateDemo } from "./actions";
import { NewDemoModal } from "./new-demo-modal";

export type DemoListRow = {
  id: string;
  slug: string;
  status: "generating" | "ready" | "error" | "published" | "archived";
  progress: { home: boolean; motifs: boolean; reviews: boolean; articles: boolean };
  generationError: string | null;
  prospectName: string;
  profession: string;
  city: string;
  linkActive: boolean;
  demoExpiresAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<DemoListRow["status"], { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  generating: { label: "En préparation", tone: "info" },
  ready: { label: "Prête à vérifier", tone: "success" },
  error: { label: "Erreur", tone: "danger" },
  published: { label: "Publiée", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
};

export function DemosPageClient({
  rows,
  total,
  page,
  pageCount,
  query,
  sitesBaseUrl,
}: {
  rows: DemoListRow[];
  total: number;
  page: number;
  pageCount: number;
  query: string;
  sitesBaseUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState(query);
  const [, startTransition] = useTransition();

  // La liste se rafraîchit tant qu'une génération est en cours
  const hasGenerating = useMemo(() => rows.some((r) => r.status === "generating"), [rows]);
  useEffect(() => {
    if (!hasGenerating) return;
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [hasGenerating, router]);

  // Recherche avec léger debounce
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (search) params.set("q", search);
      else params.delete("q");
      params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Démos</h1>
          <p className="mt-1 text-sm text-ink-500">
            {total} démo{total > 1 ? "s" : ""} · sites de démonstration pour l&apos;avant-vente
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Créer une démo</Button>
      </div>

      <div className="mt-6">
        <Input
          type="search"
          placeholder="Rechercher par nom, métier ou ville…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
          aria-label="Rechercher une démo"
        />
      </div>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-medium">Prospect</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Contenu généré</th>
              <th className="px-4 py-3 font-medium">Validité</th>
              <th className="px-4 py-3 font-medium">Créée</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-500">
                  {query
                    ? "Aucune démo ne correspond à cette recherche."
                    : "Aucune démo pour l'instant. Créez la première !"}
                </td>
              </tr>
            ) : (
              rows.map((row) => <DemoRow key={row.id} row={row} sitesBaseUrl={sitesBaseUrl} />)
            )}
          </tbody>
        </table>
      </Card>

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`${pathname}?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) })}`}
              className={
                p === page
                  ? "rounded-full bg-primary-500 px-3 py-1 font-medium text-white"
                  : "rounded-full px-3 py-1 text-ink-700 hover:bg-cream-200"
              }
            >
              {p}
            </Link>
          ))}
        </div>
      ) : null}

      <NewDemoModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function DemoRow({ row, sitesBaseUrl }: { row: DemoListRow; sitesBaseUrl: string }) {
  const [duplicating, setDuplicating] = useState(false);
  const status = STATUS_LABELS[row.status];
  const demoUrl = `${sitesBaseUrl}/${row.slug}`;

  return (
    <tr className="border-b border-cream-200 last:border-0 hover:bg-cream-50">
      <td className="px-4 py-3">
        <p className="font-medium text-ink-900">{row.prospectName}</p>
        <p className="text-xs text-ink-500">
          {row.profession}
          {row.city ? ` · ${row.city}` : ""}
        </p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={status.tone}>
          {row.status === "generating" ? <Spinner className="h-3 w-3" /> : null}
          {status.label}
        </Badge>
        {row.status === "error" && row.generationError ? (
          <p className="mt-1 max-w-56 truncate text-xs text-danger-500" title={row.generationError}>
            {row.generationError}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <ProgressDots
          dots={[
            { label: "Accueil", done: row.progress.home },
            { label: "Motifs", done: row.progress.motifs },
            { label: "Avis", done: row.progress.reviews },
            { label: "Articles", done: row.progress.articles },
          ]}
        />
      </td>
      <td className="px-4 py-3">
        {row.linkActive ? (
          <span className="text-success-500">Lien actif</span>
        ) : (
          <span className="text-warning-500">Expiré</span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-500">{relativeTimeFr(new Date(row.createdAt))}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <a
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Voir la démo"
            className="rounded-full p-2 text-ink-500 hover:bg-cream-200 hover:text-ink-900"
          >
            <IconEye />
          </a>
          <Link
            href={`/demos/${row.id}/edit`}
            title="Éditer"
            className="rounded-full p-2 text-ink-500 hover:bg-cream-200 hover:text-ink-900"
          >
            <IconPencil />
          </Link>
          <button
            type="button"
            title="Dupliquer"
            disabled={duplicating}
            onClick={() => {
              setDuplicating(true);
              void duplicateDemo(row.id).finally(() => setDuplicating(false));
            }}
            className="rounded-full p-2 text-ink-500 hover:bg-cream-200 hover:text-ink-900 disabled:opacity-40"
          >
            {duplicating ? <Spinner className="h-4 w-4" /> : <IconCopy />}
          </button>
        </div>
      </td>
    </tr>
  );
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
