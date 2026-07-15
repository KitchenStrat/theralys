"use client";

import { useState, useTransition } from "react";
import { Button } from "@theralys/ui";
import { openBillingPortal } from "./actions";

export function PortalButton() {
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
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
      {note ? <p className="mt-2 text-xs text-ink-500">{note}</p> : null}
    </div>
  );
}
