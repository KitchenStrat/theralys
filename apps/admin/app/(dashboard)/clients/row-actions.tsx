"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@theralys/ui";
import { getSiteEditorUrl } from "../demos/actions";
import { resendClientInvitation } from "./actions";
import { OpenStudioButton } from "./open-studio-button";

const BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-cream-100 disabled:opacity-50";

/** Accès admin à un site client : éditeur visuel, studio, renvoi d'invitation. */
export function ClientRowActions({
  siteId,
  invitePending,
}: {
  siteId: string;
  invitePending: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {invitePending ? <ResendInviteButton siteId={siteId} /> : null}
      <EditSiteButton siteId={siteId} />
      <OpenStudioButton siteId={siteId} />
    </div>
  );
}

function EditSiteButton({ siteId }: { siteId: string }) {
  const [busy, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      title="Modifier textes et photos dans l'éditeur visuel"
      onClick={() => {
        const popup = window.open("about:blank", "_blank");
        startTransition(async () => {
          const result = await getSiteEditorUrl(siteId);
          if ("url" in result && popup) popup.location.href = result.url;
          else popup?.close();
        });
      }}
      className={BUTTON_CLASS}
    >
      {busy ? <Spinner className="h-3 w-3" /> : "🎨"} Éditer
    </button>
  );
}

function ResendInviteButton({ siteId }: { siteId: string }) {
  const [busy, startTransition] = useTransition();
  const [label, setLabel] = useState<string | null>(null);

  return (
    <button
      type="button"
      disabled={busy}
      title="Le client n'a pas encore créé son mot de passe — renvoyer le lien d'invitation"
      onClick={() =>
        startTransition(async () => {
          const result = await resendClientInvitation(siteId);
          if ("error" in result) {
            setLabel("Erreur");
          } else {
            await navigator.clipboard.writeText(result.setupUrl).catch(() => {});
            setLabel(result.emailSent ? "E-mail renvoyé ✓" : "Lien copié ✓");
          }
          setTimeout(() => setLabel(null), 2500);
        })
      }
      className={BUTTON_CLASS}
    >
      {busy ? <Spinner className="h-3 w-3" /> : "✉️"} {label ?? "Invitation"}
    </button>
  );
}
