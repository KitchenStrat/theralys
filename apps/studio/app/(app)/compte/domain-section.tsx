"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleCheck, Globe, Info, Link2, Search, ShieldCheck, ShoppingCart, TriangleAlert } from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { Badge, Button, Card, CardHeader, InlineSuccess, StatusPill } from "@/components/ds";
import { purchaseDomain, requestExternalDomain, searchDomain } from "./actions";

type Availability = { domain: string; available: boolean; pricePerYear: number | null };

/** Champs de saisie : 44 px de haut et corps en 16 px (lisible, et sans zoom forcé sur téléphone). */
const INPUT = "min-h-11 text-base!";
const LINK = "rounded font-semibold text-ds-brand-700 underline underline-offset-2 ds-focus [overflow-wrap:anywhere]";

export function DomainSection({
  currentDomain,
  domainStatus,
  externalRequest,
  fallbackUrl,
  ownSiteAddress = null,
  primaryPurchase = false,
}: {
  currentDomain: string | null;
  domainStatus: "pending" | "registered" | "configured" | "error" | null;
  /** Domaine que le client possède déjà, en attente de rattachement par l'équipe. */
  externalRequest: string | null;
  /** Adresse du site hébergé (toujours elle : ce bloc gère le domaine du site Harmony) */
  fallbackUrl: string;
  /**
   * Adresse, sans protocole, du site du client quand il est la référence des
   * outils. Le bloc précise alors qu'il ne concerne que le site Harmony : le
   * domaine du site du client se gère chez lui, son adresse dans « Mon site ».
   */
  ownSiteAddress?: string | null;
  /** « Acheter ce domaine » en bouton principal : quand l'écran n'en porte pas d'autre (pas de facturation à gérer) */
  primaryPurchase?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownDomain, setOwnDomain] = useState("");
  const [ownError, setOwnError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // Présentation seulement : lequel des trois boutons tourne
  const [running, setRunning] = useState<"recherche" | "achat" | "rattachement" | null>(null);

  // Site du client en référence : « mon domaine » et « votre site » désigneraient le mauvais site
  const heading = ownSiteAddress ? "Domaine de mon site Harmony" : "Mon domaine";
  const yourSite = ownSiteAddress ? "Votre site Harmony" : "Votre site";
  const toYourSite = ownSiteAddress ? "à votre site Harmony" : "à votre site";
  // À quoi sert un nom de domaine, en une phrase — sauf quand les patients passent par le site du praticien
  const purpose = ownSiteAddress ? undefined : "L'adresse à laquelle vos patients trouvent votre site.";
  const ownSiteNotice = ownSiteAddress ? (
    <div className="mt-5 flex items-start gap-3 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
      <Info size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
      <p role="note" className="min-w-0 text-ds-body text-ds-ink-700">
        Vos outils s&apos;appuient sur votre propre site,{" "}
        <strong className="font-semibold text-ds-ink-900 [overflow-wrap:anywhere]">{ownSiteAddress}</strong> : son adresse se
        gère dans{" "}
        <Link href="/mon-site" className={LINK}>
          Mon site
        </Link>
        . Le domaine ci-dessous est celui de votre site Harmony.
      </p>
    </div>
  ) : null;

  if (currentDomain) {
    return (
      <Card as="section">
        <CardHeader icon={Globe} title={heading} description={purpose} />
        {ownSiteNotice}
        <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
          {domainStatus === "configured" ? (
            <Badge tone="success" icon={ShieldCheck}>
              Actif · connexion sécurisée
            </Badge>
          ) : domainStatus === "error" ? (
            <Badge tone="danger" icon={TriangleAlert}>
              Erreur de configuration
            </Badge>
          ) : (
            <StatusPill status="en-cours">Configuration en cours…</StatusPill>
          )}
          <p className="mt-2.5 font-ds-display text-2xl/8 font-bold text-ds-section-ink [overflow-wrap:anywhere]">{currentDomain}</p>
        </div>
        <p className="mt-4 text-ds-body text-ds-ink-600">
          {yourSite} est servi sur{" "}
          <a href={`https://${currentDomain}`} className={LINK} target="_blank" rel="noopener noreferrer">
            https://{currentDomain}
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
          . Le renouvellement est géré par Harmony.
        </p>
      </Card>
    );
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setRunning("recherche");
    startTransition(async () => {
      const outcome = await searchDomain(query);
      if ("error" in outcome) setError(outcome.error);
      else setResult(outcome);
    });
  }

  function onBuy() {
    if (!result) return;
    setError(null);
    setRunning("achat");
    startTransition(async () => {
      const outcome = await purchaseDomain(result.domain);
      if (outcome.error) setError(outcome.error);
      else router.refresh();
    });
  }

  function onRequestAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOwnError(null);
    setRunning("rattachement");
    startTransition(async () => {
      const outcome = await requestExternalDomain(ownDomain);
      if (outcome.error) setOwnError(outcome.error);
      else router.refresh();
    });
  }

  return (
    <Card as="section">
      <CardHeader icon={Globe} title={heading} description={purpose} />
      {ownSiteNotice}
      <p className="mt-5 text-ds-body text-ds-ink-600">
        {yourSite} est actuellement accessible sur{" "}
        <a href={fallbackUrl} className={LINK} target="_blank" rel="noopener noreferrer">
          {fallbackUrl}
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
        . Donnez-lui sa propre adresse : cherchez un domaine, nous nous occupons de tout (achat, réglages techniques,
        certificat de sécurité).
      </p>

      <form onSubmit={onSearch} className="mt-4">
        <Label htmlFor="domain">Nom de domaine souhaité</Label>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-[1_1_12rem]">
            <Input
              id="domain"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="mon-cabinet.fr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={INPUT}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || query.trim().length < 4}
            loading={busy && running === "recherche"}
            icon={<Search size={18} aria-hidden />}
          >
            Vérifier
          </Button>
        </div>
        <FieldHint>Extensions conseillées : .fr, .com, .eu</FieldHint>
      </form>

      {result ? (
        result.available ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-ds-md bg-ds-success-100 px-4 py-3.5 ds-rise">
            <InlineSuccess>
              <span className="[overflow-wrap:anywhere]">{result.domain}</span> est disponible
            </InlineSuccess>
            <Button
              variant={primaryPurchase ? "primary" : "secondary"}
              size="sm"
              disabled={busy}
              loading={busy && running === "achat"}
              icon={<ShoppingCart size={16} aria-hidden />}
              onClick={onBuy}
            >
              Acheter ce domaine
            </Button>
          </div>
        ) : (
          <p role="status" className="mt-4 flex items-start gap-2.5 rounded-ds-md bg-ds-warning-100 px-4 py-3.5 text-ds-body text-ds-warning-900 ds-rise">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              <strong className="font-semibold [overflow-wrap:anywhere]">{result.domain}</strong> n&apos;est pas disponible. Essayez
              une variante (ville, prénom…).
            </span>
          </p>
        )
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="mt-6 border-t border-ds-ink-200 pt-5">
        <h3 className="flex items-center gap-2 font-ds-display text-lg/7 font-bold text-ds-ink-900">
          <Link2 size={20} aria-hidden className="shrink-0 text-ds-section-accent" />
          Rattacher mon nom de domaine
        </h3>
        {externalRequest ? (
          <div className="mt-3 rounded-ds-md bg-ds-section-tint px-4 py-3.5 ring-1 ring-ds-section-line/70">
            <p className="flex items-start gap-2 text-base text-ds-ink-900">
              <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-success-700" />
              <span className="min-w-0">
                <strong className="font-semibold [overflow-wrap:anywhere]">{externalRequest}</strong> — demande enregistrée
              </span>
            </p>
            <p className="mt-1.5 text-ds-body text-ds-ink-700">
              Notre équipe s&apos;occupe du rattachement {toYourSite} (transfert ou réglages techniques, puis certificat de
              sécurité) et revient vers vous rapidement. Rien à faire de votre côté.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-ds-body text-ds-ink-600">
              {ownSiteAddress ? "Vous possédez un autre nom de domaine" : "Vous possédez déjà un nom de domaine"} (chez OVH,
              Ionos, Gandi…) ? Indiquez-le ci-dessous : notre équipe s&apos;occupe de le rattacher {toYourSite}.
            </p>
            <form onSubmit={onRequestAttachment} className="mt-3">
              <Label htmlFor="own-domain">Votre domaine actuel</Label>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-0 flex-[1_1_12rem]">
                  <Input
                    id="own-domain"
                    value={ownDomain}
                    onChange={(e) => setOwnDomain(e.target.value)}
                    placeholder="mon-cabinet.fr"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={INPUT}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || ownDomain.trim().length < 4}
                  loading={busy && running === "rattachement"}
                >
                  Demander le rattachement
                </Button>
              </div>
            </form>
            {ownError ? (
              <p role="alert" className="mt-3 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {ownError}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
