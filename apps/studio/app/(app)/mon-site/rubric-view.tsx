import type { ReactNode } from "react";
import type { ExternalSiteProfile } from "@theralys/shared";
import { SOCIAL_NETWORKS, bookingDisplay, type RubricId } from "@/lib/external-site/rubrics";
import { siteAddressLabel } from "@/lib/external-site/format";
import { TEXT_LINK } from "./styles";

/**
 * Contenu d'une rubrique du profil, en lecture : ce que les outils
 * utiliseront. Textes du profil tels quels (déjà nettoyés par le contrat),
 * liens ouverts dans un nouvel onglet.
 */

function Sub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-700">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`wrap-anywhere ${TEXT_LINK}`}>
      {children}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

const Paragraphs = ({ items }: { items: readonly string[] }) => (
  <div className="space-y-2">
    {items.map((text, index) => (
      <p key={index}>{text}</p>
    ))}
  </div>
);

export function RubricView({ rubric, profile }: { rubric: RubricId; profile: ExternalSiteProfile }) {
  switch (rubric) {
    case "presentation":
      return (
        <div className="space-y-4">
          {profile.headline !== "" ? <p className="text-lg font-semibold text-ink-900">{profile.headline}</p> : null}
          {profile.intro.length > 0 ? <Paragraphs items={profile.intro} /> : null}
          {profile.highlights.length > 0 ? (
            <Sub label="Points forts">
              <ul className="list-disc space-y-1 pl-5">
                {profile.highlights.map((item, index) => (
                  <li key={index}>
                    <span className="font-medium text-ink-900">{item.title}</span>
                    {item.text ? `\u00a0: ${item.text}` : ""}
                  </li>
                ))}
              </ul>
            </Sub>
          ) : null}
        </div>
      );
    case "specialties":
      return (
        <ul className="space-y-3">
          {profile.specialties.map((specialty) => (
            <li key={specialty.slug}>
              <p className="font-semibold text-ink-900">{specialty.title}</p>
              {specialty.excerpt !== "" ? <p>{specialty.excerpt}</p> : null}
              {specialty.url ? (
                <p className="text-sm">
                  Page de votre site&nbsp;: <ExternalLink href={specialty.url}>{siteAddressLabel(specialty.url)}</ExternalLink>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      );
    case "about":
      return (
        <div className="space-y-4">
          {profile.about.paragraphs.length > 0 ? <Paragraphs items={profile.about.paragraphs} /> : null}
          {profile.about.credentials.length > 0 ? (
            <Sub label="Diplômes et formations">
              <ul className="list-disc space-y-1 pl-5">
                {profile.about.credentials.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </Sub>
          ) : null}
        </div>
      );
    case "practical":
      return (
        <dl className="space-y-2">
          {profile.practical.map((item, index) => (
            <div key={index}>
              <dt className="font-medium text-ink-900">{item.title}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      );
    case "process":
      return (
        <ol className="list-decimal space-y-2 pl-5">
          {profile.process.map((step, index) => (
            <li key={index}>
              <span className="font-medium text-ink-900">{step.title}</span>&nbsp;: {step.description}
            </li>
          ))}
        </ol>
      );
    case "faq":
      return (
        <dl className="space-y-3">
          {profile.faq.map((item, index) => (
            <div key={index}>
              <dt className="font-medium text-ink-900">{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      );
    case "contact": {
      const { address, phone, email, hours, note } = profile.contact;
      return (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {address ? (
            <div>
              <dt className="font-medium text-ink-900">Adresse</dt>
              <dd>{address}</dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="font-medium text-ink-900">Téléphone</dt>
              <dd>{phone}</dd>
            </div>
          ) : null}
          {email ? (
            <div>
              <dt className="font-medium text-ink-900">Adresse e-mail</dt>
              <dd className="wrap-anywhere">{email}</dd>
            </div>
          ) : null}
          {hours.length > 0 ? (
            <div>
              <dt className="font-medium text-ink-900">Horaires</dt>
              <dd>
                <ul>
                  {hours.map((line, index) => (
                    <li key={index}>
                      {line.label}&nbsp;: {line.value}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {note ? (
            <div>
              <dt className="font-medium text-ink-900">Précision</dt>
              <dd>{note}</dd>
            </div>
          ) : null}
        </dl>
      );
    }
    case "booking": {
      const booking = bookingDisplay(profile.bookingUrl);
      if (!booking) return null;
      return booking.kind === "phone" ? (
        <p>
          Par téléphone, au <span className="font-medium text-ink-900">{booking.number}</span>.
        </p>
      ) : (
        <p>
          {booking.platform ? `Sur ${booking.platform}\u00a0: ` : "En ligne\u00a0: "}
          <ExternalLink href={booking.href}>{siteAddressLabel(booking.href)}</ExternalLink>
        </p>
      );
    }
    case "social":
      return (
        <ul className="space-y-1.5">
          {SOCIAL_NETWORKS.filter((network) => profile.social[network.key]).map((network) => (
            <li key={network.key}>
              <span className="font-medium text-ink-900">{network.label}&nbsp;:</span> <ExternalLink href={profile.social[network.key] ?? ""}>{siteAddressLabel(profile.social[network.key] ?? "")}</ExternalLink>
            </li>
          ))}
        </ul>
      );
  }
}
