import { Check, Clock, Info, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
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
      <p className="text-ds-meta font-semibold text-ds-ink-600">{label}</p>
      <div className="mt-1.5">{children}</div>
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

/** Tuile d'une spécialité : un fond à peine teinté la détache de ses voisines. */
const TILE = "rounded-ds-sm bg-ds-ink-50 px-4 py-3 ring-1 ring-ds-ink-200";

/** Liste « intitulé, détail » (infos pratiques, questions) : un filet entre deux lignes, sans cadre. */
const PAIRS = "divide-y divide-ds-ink-200 [&>div]:py-2.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0";

/** Une coordonnée : son pictogramme, son intitulé et sa valeur. */
function ContactItem({ icon: Icon, label, className, children }: { icon: LucideIcon; label: string; className?: string; children: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-ds-meta font-semibold text-ds-ink-600">
        <Icon size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
        {label}
      </dt>
      <dd className={`mt-0.5 pl-6 text-ds-ink-900 ${className ?? ""}`}>{children}</dd>
    </div>
  );
}

export function RubricView({ rubric, profile }: { rubric: RubricId; profile: ExternalSiteProfile }) {
  switch (rubric) {
    case "presentation":
      return (
        <div className="space-y-4">
          {profile.headline !== "" ? <p className="font-ds-display text-xl/7 font-bold text-ds-section-ink">{profile.headline}</p> : null}
          {profile.intro.length > 0 ? <Paragraphs items={profile.intro} /> : null}
          {profile.highlights.length > 0 ? (
            <Sub label="Points forts">
              <ul className="space-y-1.5">
                {profile.highlights.map((item, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <Check size={18} strokeWidth={2.5} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                    <span>
                      <span className="font-semibold text-ds-ink-900">{item.title}</span>
                      {item.text ? `\u00a0: ${item.text}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Sub>
          ) : null}
        </div>
      );
    case "specialties":
      return (
        <ul className="grid gap-3">
          {profile.specialties.map((specialty) => (
            <li key={specialty.slug} className={TILE}>
              <p className="font-semibold text-ds-ink-900">{specialty.title}</p>
              {specialty.excerpt !== "" ? <p className="mt-0.5 text-ds-body">{specialty.excerpt}</p> : null}
              {specialty.url ? (
                <p className="mt-1.5 text-ds-meta text-ds-ink-600">
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
              <ul className="space-y-1.5">
                {profile.about.credentials.map((line, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <Check size={18} strokeWidth={2.5} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Sub>
          ) : null}
        </div>
      );
    case "practical":
      return (
        <dl className={PAIRS}>
          {profile.practical.map((item, index) => (
            <div key={index}>
              <dt className="font-semibold text-ds-ink-900">{item.title}</dt>
              <dd className="mt-0.5 text-ds-body">{item.text}</dd>
            </div>
          ))}
        </dl>
      );
    case "process":
      return (
        <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-ds-section-accent">
          {profile.process.map((step, index) => (
            <li key={index} className="pl-1">
              <span className="font-semibold text-ds-ink-900">{step.title}</span>&nbsp;: {step.description}
            </li>
          ))}
        </ol>
      );
    case "faq":
      return (
        <dl className={PAIRS}>
          {profile.faq.map((item, index) => (
            <div key={index}>
              <dt className="font-semibold text-ds-ink-900">{item.question}</dt>
              <dd className="mt-0.5 text-ds-body">{item.answer}</dd>
            </div>
          ))}
        </dl>
      );
    case "contact": {
      const { address, phone, email, hours, note } = profile.contact;
      return (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {address ? (
            <ContactItem icon={MapPin} label="Adresse">
              {address}
            </ContactItem>
          ) : null}
          {phone ? (
            <ContactItem icon={Phone} label="Téléphone">
              {phone}
            </ContactItem>
          ) : null}
          {email ? (
            <ContactItem icon={Mail} label="Adresse e-mail" className="wrap-anywhere">
              {email}
            </ContactItem>
          ) : null}
          {hours.length > 0 ? (
            <ContactItem icon={Clock} label="Horaires">
              <ul>
                {hours.map((line, index) => (
                  <li key={index}>
                    {line.label}&nbsp;: {line.value}
                  </li>
                ))}
              </ul>
            </ContactItem>
          ) : null}
          {note ? (
            <ContactItem icon={Info} label="Précision">
              {note}
            </ContactItem>
          ) : null}
        </dl>
      );
    }
    case "booking": {
      const booking = bookingDisplay(profile.bookingUrl);
      if (!booking) return null;
      return booking.kind === "phone" ? (
        <p>
          Par téléphone, au <span className="font-semibold text-ds-ink-900">{booking.number}</span>.
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
              <span className="font-semibold text-ds-ink-900">{network.label}&nbsp;:</span> <ExternalLink href={profile.social[network.key] ?? ""}>{siteAddressLabel(profile.social[network.key] ?? "")}</ExternalLink>
            </li>
          ))}
        </ul>
      );
  }
}
