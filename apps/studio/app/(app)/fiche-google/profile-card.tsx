"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import type { GoogleAuditView, GoogleLinkedProfile } from "@/lib/google/data";
import { refreshGoogleProfile } from "./actions";
import { GoogleGlyph } from "./link-card";
import { Stars } from "./stars";

/** « Synchronisée le 26 octobre 2026 à 09:12 ». */
export function formatSyncDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
}

/** Fiche reliée : nom, adresse, note, dernière synchronisation et bouton « Actualiser » (1 fois par 24 h). */
export function ProfileCard({ linked, latestAudit }: { linked: GoogleLinkedProfile; latestAudit: GoogleAuditView | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await refreshGoogleProfile();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Fiche actualisée.");
      router.refresh();
    });
  }

  const rating = latestAudit?.snapshot.rating ?? linked.rating;
  const votes = latestAudit?.snapshot.votes ?? linked.reviewCount;
  const address = latestAudit?.snapshot.address ?? linked.address;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <GoogleGlyph />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{latestAudit?.snapshot.title ?? linked.name}</h2>
            {address ? <p className="text-sm text-ink-500">{address}</p> : null}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-700">
              {rating !== null && rating !== undefined ? (
                <>
                  <Stars rating={rating} />
                  <span>
                    <strong>{rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</strong>
                    {votes !== null && votes !== undefined ? ` · ${votes} avis` : ""}
                  </span>
                </>
              ) : (
                <span>Pas encore de note.</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Button variant="secondary" size="sm" onClick={refresh} disabled={pending}>
            {pending ? <Spinner /> : null} Actualiser
          </Button>
          <p className="text-xs text-ink-500">
            {latestAudit ? `Synchronisée le ${formatSyncDate(latestAudit.createdAt)}` : "Jamais synchronisée"}
          </p>
        </div>
      </div>
      {pending ? (
        <p className="mt-3 text-sm text-ink-700" aria-live="polite">
          Lecture de votre fiche et recalcul de l&apos;audit… quelques secondes.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-success-500" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger-500" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
