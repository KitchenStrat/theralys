"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Check, Copy, FileDown, FileSpreadsheet, Link2 } from "lucide-react";
import { Button, Card, CardHeader, NBSP } from "@/components/ds";
import { bioLinksOf, type SocialSiteLink } from "@/lib/social/site-link";
import { Disclosure, DownloadLink, ErrorNote } from "./social-ui";

/** Sous 640 px, les boutons d'export empilés s'alignent à gauche : icône puis libellé, sur une ou deux lignes. */
const STACKED_LINK_CLASS = "max-sm:justify-start max-sm:text-left";

/**
 * Export du mois vers un planificateur (CSV : une ligne par contenu à venir,
 * non publié, et par réseau) ou un agenda (ICS : un événement par contenu du
 * mois). Rien à exporter sans contenu.
 */
export function ExportCard({ monthParam, count }: { monthParam: string; count: number }) {
  if (count === 0) return null;
  const href = (format: "csv" | "ics") => `/api/social/export?mois=${monthParam}&format=${format}`;
  return (
    <Card as="section" aria-labelledby="export-titre">
      <CardHeader
        icon={FileDown}
        title={<span id="export-titre">Exporter le mois</span>}
        description="Pour programmer vos contenus dans un planificateur, ou les retrouver dans votre agenda."
      />
      {/* Étroit : deux boutons de même largeur, l'un sous l'autre, alignés à gauche (le premier libellé prend deux lignes) */}
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <DownloadLink
          href={href("csv")}
          icon={<FileSpreadsheet size={18} aria-hidden className="shrink-0" />}
          className={STACKED_LINK_CLASS}
        >
          Exporter le mois (CSV planificateur)
        </DownloadLink>
        <DownloadLink
          href={href("ics")}
          icon={<CalendarPlus size={18} aria-hidden className="shrink-0" />}
          className={STACKED_LINK_CLASS}
        >
          Ajouter à mon agenda (ICS)
        </DownloadLink>
      </div>
      <Disclosure summary={`Comment utiliser ces fichiers${NBSP}?`} className="mt-4">
        <p>
          Importez le CSV dans Metricool, Buffer ou Later : les contenus à venir, non publiés, une ligne par contenu et
          par réseau, avec la légende du réseau. À l&apos;import, faites correspondre les colonnes date, heure, texte,
          image_url et réseau à celles de votre planificateur. L&apos;ICS ajoute chaque contenu du mois à votre agenda,
          avec un lien vers cette page.
        </p>
        <p>
          image_url : lien public du visuel (préparé à l&apos;export) ; vide si le visuel n&apos;a pas pu être préparé.
        </p>
      </Disclosure>
    </Card>
  );
}

/**
 * « Votre lien de bio ». Site hébergé : l'URL du site avec `?src=ig`
 * (Instagram ; `fb` pour Facebook), pour que les visites venues des réseaux
 * apparaissent dans la provenance des statistiques. Site du client en
 * référence : son adresse seule, la même pour tous les réseaux — la
 * provenance est alors relevée par le code de mesure installé sur son site,
 * qui ne lit pas les paramètres d'une adresse.
 */
export function BioLinkCard({ siteLink }: { siteLink: SocialSiteLink }) {
  const [copied, setCopied] = useState<"instagram" | "facebook" | null>(null);
  const [failed, setFailed] = useState(false);
  const { main, facebook } = bioLinksOf(siteLink);

  async function copy(network: "instagram" | "facebook", link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFailed(false);
      setCopied(network);
      setTimeout(() => setCopied((c) => (c === network ? null : c)), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Card as="section" aria-labelledby="lien-bio-titre">
      <CardHeader
        icon={Link2}
        title={<span id="lien-bio-titre">Votre lien de bio</span>}
        description={
          facebook
            ? "Mettez ce lien dans votre bio Instagram : les visites qui en viennent apparaissent dans vos statistiques."
            : "Un seul lien pour tous vos réseaux : l'adresse de votre site."
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {/* L'adresse entière reste lisible : elle passe à la ligne plutôt que d'être coupée */}
        <code
          className="min-w-0 flex-[1_1_14rem] rounded-ds-sm bg-ds-section-tint px-3 py-2.5 text-ds-meta break-all text-ds-ink-800 inset-ring inset-ring-ds-section-line"
          title={main}
        >
          {main}
        </code>
        <Button
          size="sm"
          variant="secondary"
          icon={copied === "instagram" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          onClick={() => copy("instagram", main)}
          aria-label={facebook ? "Copier le lien de bio Instagram" : "Copier le lien de bio"}
        >
          {copied === "instagram" ? "Copié !" : "Copier"}
        </Button>
        {facebook ? (
          <Button
            size="sm"
            variant="quiet"
            icon={copied === "facebook" ? <Check size={16} aria-hidden /> : undefined}
            onClick={() => copy("facebook", facebook)}
            aria-label="Copier le lien de bio Facebook"
          >
            {copied === "facebook" ? "Copié !" : "Version Facebook"}
          </Button>
        ) : null}
        {/* Le nom accessible des boutons ne change pas : la copie est annoncée ici */}
        <span role="status" className="sr-only">
          {copied === "instagram" ? "Lien de bio copié." : copied === "facebook" ? "Lien de bio Facebook copié." : ""}
        </span>
      </div>
      {failed ? (
        <ErrorNote className="mt-3">Copie impossible — sélectionnez le lien et copiez-le manuellement.</ErrorNote>
      ) : null}
      {facebook ? (
        <Disclosure summary={`Et pour Facebook${NBSP}?`} className="mt-4">
          <p>
            Même lien pour Facebook, avec <code className="rounded bg-ds-ink-100 px-1 py-0.5 text-ds-meta">src=fb</code>.
          </p>
        </Disclosure>
      ) : (
        <Disclosure summary={`Comment sont comptées les visites${NBSP}?`} className="mt-4">
          <p>
            La provenance des visites apparaît dans vos statistiques une fois le code de mesure installé sur votre site
            (rubrique{" "}
            <Link href="/mon-site" className="rounded font-semibold text-ds-brand-700 underline underline-offset-2 ds-focus">
              Mon site
            </Link>
            ).
          </p>
        </Disclosure>
      )}
    </Card>
  );
}
