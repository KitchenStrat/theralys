"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ds";
import { openBillingPortal } from "./actions";

export function PortalButton() {
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div>
      <Button
        loading={busy}
        iconRight={<ExternalLink size={18} aria-hidden />}
        onClick={() =>
          startTransition(async () => {
            const { url } = await openBillingPortal();
            if (url) window.location.href = url;
            else
              setNote(
                "Portail de facturation indisponible en mode démo — il s'ouvrira ici une fois Stripe configuré.",
              );
          })
        }
      >
        Gérer ma facturation
      </Button>
      <p className="mt-2 text-ds-meta text-ds-ink-600">
        Le portail s&apos;ouvre sur une page de paiement sécurisée ; vous revenez ici ensuite.
      </p>
      {note ? (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-ds-sm bg-ds-ink-100 px-3.5 py-2.5 text-ds-body text-ds-ink-700">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0" />
          {note}
        </p>
      ) : null}
    </div>
  );
}
