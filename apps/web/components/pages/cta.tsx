import { Check } from "lucide-react";
import { inline } from "./prose";
import { DemoButton, HomeButton } from "./shell";

/*
 * Les appels à l'action des pages de contenu. Chacun porte les deux mêmes
 * chemins : la demande de démo (elle ouvre la fenêtre) et l'accueil, où
 * Harmony est présenté. Trois formes, de la plus discrète à la plus visible :
 * la ligne de fin de section, la carte au fil d'un article, l'encart qui suit
 * la lecture sur grand écran.
 */

/** Fin de section : une phrase, puis les deux boutons — comme sur l'accueil, où chaque grande section se termine ainsi. */
export function SectionAction({ text, dark = false, className = "mt-10" }: { text: string; /** Section sur fond sombre */ dark?: boolean; className?: string }) {
  return (
    <div data-cta-group="section" className={`flex flex-col items-center gap-4 text-center lg:flex-row lg:justify-center lg:gap-6 lg:text-left ${className}`}>
      <p className={`text-lg font-medium text-pretty ${dark ? "text-white/90" : "text-ink-900"}`}>{inline(text, dark ? { strong: "font-semibold text-white" } : undefined)}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <DemoButton />
        <HomeButton dark={dark} />
      </div>
    </div>
  );
}

/** Une section à elle seule : la même ligne, sur toute la largeur, entre deux parties d'une page. */
export function ActionStrip({ text, tone = "white" }: { text: string; tone?: "white" | "cream" }) {
  return (
    <div className={tone === "cream" ? "bg-cream-100" : "bg-white"}>
      <div className="mx-auto max-w-6xl px-5 pb-14 md:pb-16">
        <SectionAction text={text} className="rounded-3xl border border-primary-100 bg-primary-50 px-6 py-7" />
      </div>
    </div>
  );
}

/** Carte au fil d'un article : elle interrompt la lecture une fois de temps en temps, jamais deux fois de suite. */
export function CtaCard({ title, text }: { title: string; text: string }) {
  return (
    <aside aria-label="Harmony" data-cta-group="carte" className="mt-12 rounded-3xl border border-primary-100 bg-[linear-gradient(135deg,var(--color-primary-50),white_70%)] px-6 py-7 sm:px-8">
      <p className="font-display text-2xl leading-tight text-balance text-ink-900">{title}</p>
      <p className="mt-2 text-[1.0625rem] leading-[1.65] text-ink-700">{inline(text)}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <DemoButton />
        <HomeButton />
      </div>
    </aside>
  );
}

/** Les cartes d'un article, dans l'ordre où elles paraissent. */
export const ARTICLE_CARDS: readonly { title: string; text: string }[] = [
  { title: "Pas le temps de vous en occuper ?", text: "Harmony prépare votre site, vos articles et vos contenus. Vous relisez, vous validez, et **vous gardez la main** sur tout ce qui paraît." },
  { title: "Voyez ce que cela donnerait pour votre cabinet", text: "Dites-nous votre pratique et votre ville : nous préparons une démo de votre futur site, **gratuitement et sans engagement**." },
  { title: "Tout au même endroit", text: "Site, blog, fiche Google, réseaux sociaux, publicité et statistiques : **un seul espace, un seul abonnement**." },
];

const ASIDE_POINTS = ["Un site à vos couleurs", "Des articles rédigés pour vous", "Votre fiche Google suivie", "Vos statistiques, au même endroit"];

/**
 * Encart qui accompagne la lecture d'un article sur grand écran : il reste
 * visible pendant tout le défilement. Sur téléphone, les cartes au fil du
 * texte et la barre fixe jouent ce rôle.
 */
export function ArticleAside() {
  return (
    <aside aria-label="Harmony" data-testid="encart-article" data-cta-group="encart" className="hidden lg:block">
      <div className="sticky top-28 rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]">
        <p className="font-display text-[1.35rem] leading-tight text-ink-900">Et si c&apos;était fait pour vous ?</p>
        <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-700">Harmony s&apos;occupe de la présence en ligne de votre cabinet. Vous gardez la main.</p>
        <ul className="mt-4 space-y-2 text-[0.95rem] text-ink-900">
          {ASIDE_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
                <Check size={13} strokeWidth={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
        <DemoButton label="Demander ma démo" className="mt-5 w-full justify-center px-4" />
        <HomeButton className="mt-2.5 w-full justify-center px-4" />
      </div>
    </aside>
  );
}
