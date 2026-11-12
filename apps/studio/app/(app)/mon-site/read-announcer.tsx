"use client";

import { useEffect, useRef, useState } from "react";

/**
 * État de l'écran pour l'annonce : `none` aucun site, `reading` lecture en
 * cours, `ready` site lu, `kept` site lu mais dernière lecture en échec
 * (profil précédent conservé), `error` première lecture en échec.
 */
export type ReadScreenState = "none" | "reading" | "ready" | "kept" | "error";

const ENDED: Partial<Record<ReadScreenState, string>> = {
  ready: "La lecture de votre site est terminée. Le profil à relire se trouve dans la page.",
  kept: "La lecture de votre site n'a pas abouti. Le profil précédent est conservé.",
  error: "La lecture de votre site n'a pas abouti. L'explication se trouve dans la page.",
};

/**
 * Annonce la fin d'une lecture aux lecteurs d'écran. La lecture se termine
 * sans action du praticien (la page se relit seule) : sans cette annonce,
 * rien ne dirait à qui n'a pas l'écran sous les yeux que le résultat est là.
 * Rendu à la même place dans tous les états de l'écran, pour que le composant
 * (et sa région vivante) survive au passage de l'un à l'autre.
 */
export function ReadAnnouncer({ state }: { state: ReadScreenState }) {
  const previous = useRef(state);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (previous.current === "reading" && state !== "reading") setMessage(ENDED[state] ?? "");
    else if (state === "reading") setMessage("");
    previous.current = state;
  }, [state]);

  return (
    <p role="status" className="sr-only" data-testid="read-announcer">
      {message}
    </p>
  );
}
