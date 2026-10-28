/**
 * Veille du marché absente d'une analyse aboutie (`market === null`) : ce
 * que la section affiche (Diagnostic, Marché) et la phrase ajoutée au
 * message de fin d'analyse. Trois cas, d'après le service (`@theralys/jobs`) :
 * - `provider === "none"` : aucun jeton ni fournisseur — un site client
 *   attend l'activation du jeton par Harmony, une démo sans mock n'a rien à
 *   relancer ;
 * - fournisseur présent et `error` renseignée : la veille a échoué (jeton
 *   invalide, bibliothèque injoignable…), le message utilisateur du service
 *   est repris tel quel ;
 * - sinon : indisponible sans précision (analyse ancienne), relance conseillée.
 * Quand la génération a aussi échoué, `error` porte le message de génération
 * (prioritaire dans le service) : il n'est pas attribué à la veille.
 * Fonctions pures.
 */

export type MarketStatusInput = {
  /** meta | mock | none (null : ligne illisible) */
  provider: string | null;
  error: string | null;
  siteType: "demo" | "client";
  /** Créas, plan vidéo ou plan manquants : `error` est alors le message de génération */
  generationMissing: boolean;
};

export type MarketUnavailableNotice = {
  title: string;
  detail: string;
  /** Relancer l'analyse peut rendre la veille disponible */
  retry: boolean;
};

export const MARKET_FAILED = "La veille du marché n'a pas pu être réalisée";
const STILL_AVAILABLE = "Votre diagnostic, vos annonces et votre plan restent disponibles";

/** Message d'échec attribuable à la veille (null si absent, sans fournisseur, ou s'il concerne la génération). */
export function marketErrorOf(input: Pick<MarketStatusInput, "provider" | "error" | "generationMissing">): string | null {
  if (input.provider === "none" || input.generationMissing) return null;
  const text = input.error?.trim() ?? "";
  return text === "" ? null : text;
}

/** Encadré des onglets Diagnostic et Marché quand l'analyse n'a pas de veille. */
export function marketUnavailableNotice(input: MarketStatusInput): MarketUnavailableNotice {
  if (input.provider === "none") {
    if (input.siteType === "client") {
      return {
        title: "Veille en attente d'activation du jeton Meta.",
        detail:
          "La bibliothèque publicitaire Meta (API officielle) demande un jeton que Harmony active sur la plateforme : dès son activation, relancez l'analyse pour obtenir les annonces des praticiens autour de vous. Votre diagnostic, vos annonces et votre plan sont déjà disponibles.",
        retry: false,
      };
    }
    return {
      title: "Veille indisponible dans cet environnement.",
      detail: `Aucun fournisseur de bibliothèque publicitaire n'est configuré ici (ni jeton Meta, ni mode démonstration). ${STILL_AVAILABLE}.`,
      retry: false,
    };
  }
  const error = marketErrorOf(input);
  if (error) {
    return { title: `${MARKET_FAILED}.`, detail: `${error} ${STILL_AVAILABLE} ; la veille s'ajoutera à une prochaine analyse.`, retry: true };
  }
  return {
    title: "La veille du marché n'est pas disponible pour cette analyse.",
    detail: "Relancez l'analyse depuis l'onglet Diagnostic pour obtenir les annonces des praticiens autour de vous.",
    retry: true,
  };
}

/** Phrase ajoutée au message de fin d'analyse quand la veille manque. */
export function marketFailureSentence(input: MarketStatusInput): string {
  if (input.provider === "none") {
    return input.siteType === "client"
      ? `${MARKET_FAILED} : jeton Meta en attente d'activation par Harmony.`
      : `${MARKET_FAILED} : aucun fournisseur disponible dans cet environnement.`;
  }
  const error = marketErrorOf(input);
  return error ? `${MARKET_FAILED} : ${/[.!?…]$/.test(error) ? error : `${error}.`}` : `${MARKET_FAILED}.`;
}
