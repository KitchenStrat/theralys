import { createMailProvider } from "@theralys/providers/mail";
import { Landing } from "@/components/landing";
import { JsonLd } from "@/components/pages/shell";
import { ORGANIZATION_JSON_LD, WEBSITE_JSON_LD } from "@/lib/site";

/**
 * La page publique de harmony-web.fr (cf. `Landing`).
 *
 * « Recevoir mon estimation par e-mail », à la fin du simulateur, n'est
 * proposé que si un service d'envoi est configuré sur ce projet
 * (`RESEND_API_KEY`) : la page ne promet pas un e-mail qui ne partirait pas.
 * La page étant préparée à la construction, la variable se lit à ce moment-là.
 */
export default function HomePage() {
  return (
    <>
      {/* Qui édite le site, pour les moteurs de recherche */}
      <JsonLd data={[ORGANIZATION_JSON_LD, WEBSITE_JSON_LD]} />
      <Landing estimateByEmail={createMailProvider().mode === "resend"} />
    </>
  );
}
