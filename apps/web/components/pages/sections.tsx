import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { inline } from "./prose";

/**
 * Une section d'une page de contenu : le titre et sa phrase d'introduction à
 * gauche, le contenu à droite (l'un sous l'autre sur téléphone). Les fonds
 * alternent d'une section à l'autre pour rythmer la lecture.
 */
export function Section({ title, intro, tone = "white", children }: { title: string; intro?: string; tone?: "white" | "cream"; children: ReactNode }) {
  return (
    <section className={tone === "cream" ? "bg-cream-100" : "bg-white"}>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <h2 className="font-display text-3xl leading-[1.15] font-bold text-balance text-ink-900 sm:text-[2.35rem]">{inline(title)}</h2>
          {intro ? <p className="mt-4 text-lg leading-relaxed text-pretty text-ink-700">{inline(intro)}</p> : null}
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

/** Une section pleine largeur : titre centré, contenu dessous (cartes, tuiles). */
export function WideSection({ title, intro, tone = "white", children }: { title: string; intro?: string; tone?: "white" | "cream"; children: ReactNode }) {
  return (
    <section className={tone === "cream" ? "bg-cream-100" : "bg-white"}>
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="font-display max-w-3xl text-3xl leading-[1.15] font-bold text-balance text-ink-900 sm:text-[2.35rem]">{inline(title)}</h2>
        {intro ? <p className="mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-ink-700">{inline(intro)}</p> : null}
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}

/** Liste à cocher : une carte par point. */
export function Checklist({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3.5 rounded-2xl border border-cream-200 bg-white px-5 py-4 text-[1.0625rem] leading-[1.65] text-ink-700 shadow-[var(--shadow-card)]">
          <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
            <Check size={15} strokeWidth={3} />
          </span>
          <span>{inline(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Un paragraphe mis en avant, dans une carte. */
export function Callout({ children }: { children: string }) {
  return <p className="rounded-2xl border border-primary-100 bg-primary-50 px-6 py-5 text-[1.0625rem] leading-[1.7] text-ink-900">{inline(children)}</p>;
}
