"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlaskConical, Link2, MapPin, RefreshCw, Store } from "lucide-react";
import { Badge, Button, Card, IconBadge, InlineSuccess } from "@/components/ds";
import type { GoogleAuditView, GoogleLinkedProfile } from "@/lib/google/data";
import { refreshGoogleProfile } from "./actions";
import { ErrorNote, WaitNote } from "./shared";
import { Stars } from "./stars";

/** « Synchronisée le 26 octobre 2026 à 09:12 ». */
export function formatSyncDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
}

/** Fiche reliée : nom, adresse, note, dernière synchronisation et bouton « Actualiser » (1 fois par 24 h). */
export function ProfileCard({
  linked,
  latestAudit,
  notice = null,
}: {
  linked: GoogleLinkedProfile;
  latestAudit: GoogleAuditView | null;
  /** Message de la liaison qui vient d'aboutir (remplace l'état local jusqu'à la prochaine action) */
  notice?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(notice);

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
  const hasRating = rating !== null && rating !== undefined;
  // Fiche lue par le fournisseur de démonstration (sites de démo) : on le dit
  const demoData = latestAudit?.snapshot.source === "mock";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-4">
          <IconBadge icon={Store} tone="soft" size="lg" className="max-sm:hidden" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="font-ds-display text-xl/7 font-bold text-ds-ink-900 text-balance sm:text-2xl/8">
                {latestAudit?.snapshot.title ?? linked.name}
              </h2>
              <Badge tone="success" icon={Link2}>
                Fiche reliée
              </Badge>
              {demoData ? (
                <Badge tone="neutral" icon={FlaskConical}>
                  Données de démonstration
                </Badge>
              ) : null}
            </div>
            {address ? (
              <p className="mt-1 flex items-start gap-1.5 text-ds-body text-ds-ink-600">
                <MapPin size={16} aria-hidden className="mt-1 shrink-0" />
                {address}
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ds-body text-ds-ink-700">
              {hasRating ? (
                <>
                  <Stars rating={rating} size="md" />
                  <span>
                    <strong className="text-base font-bold text-ds-ink-900">
                      {rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                    </strong>
                    {votes !== null && votes !== undefined ? ` · ${votes} avis` : ""}
                  </span>
                </>
              ) : (
                <span>Pas encore de note.</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <Button variant="secondary" size="sm" onClick={refresh} loading={pending} icon={<RefreshCw size={16} aria-hidden />}>
            Actualiser
          </Button>
          <p className="text-ds-meta text-ds-ink-600">
            {latestAudit ? `Synchronisée le ${formatSyncDate(latestAudit.snapshot.fetchedAt)}` : "Jamais synchronisée"}
          </p>
        </div>
      </div>
      {pending ? <WaitNote className="mt-4">Lecture de votre fiche et recalcul de l&apos;audit… quelques secondes.</WaitNote> : null}
      {message ? <InlineSuccess className="mt-4">{message}</InlineSuccess> : null}
      {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
    </Card>
  );
}
