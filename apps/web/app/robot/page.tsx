import type { Metadata } from "next";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "HarmonyBot — notre lecteur de sites",
  description:
    "HarmonyBot lit le site internet d'un praticien à sa demande, pour préparer ses contenus. Ce qu'il fait, ce qu'il ne fait pas, et comment lui interdire un site.",
  alternates: { canonical: "/robot" },
};

/** Nom sous lequel le lecteur se présente aux sites qu'il lit (cf. `@theralys/providers/website`). */
const USER_AGENT = "HarmonyBot/1.0 (+https://www.harmony-web.fr/robot)";

const DOES = [
  "Il lit au plus une douzaine de pages publiques, à un rythme mesuré (jamais plus de deux pages à la fois) : à la connexion du site, quand le praticien le redemande, puis environ une fois par mois pour rester à jour.",
  "Il se présente toujours sous son nom, jamais comme un navigateur.",
  "Il respecte le fichier robots.txt et s'arrête dès qu'un site refuse la lecture automatique. Il ne contourne aucune protection.",
  "Il ne remplit aucun formulaire, ne se connecte à aucun espace privé et ne lit aucune page protégée.",
  "Ce qu'il lit sert uniquement au praticien propriétaire du site, pour préparer ses propres contenus. Le texte est conservé tant que le site reste connecté, puis supprimé.",
];

/**
 * Page publique annoncée par le lecteur de sites dans son identité
 * (`User-Agent`) : tout propriétaire de site qui voit passer HarmonyBot doit
 * pouvoir comprendre ce qu'il fait et comment le refuser.
 */
export default function RobotPage() {
  return (
    <div className="min-h-screen bg-white text-ink-700">
      <header className="border-b border-cream-200">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5">
          <a href="/" className="text-2xl" aria-label="Harmony — accueil">
            <Brand />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-bold text-ink-900">HarmonyBot, notre lecteur de sites</h1>
        <p className="mt-5 text-lg leading-relaxed">
          HarmonyBot est le programme qu&apos;utilise Harmony pour lire le site internet d&apos;un praticien, <strong>à sa demande</strong>.
          Quand un praticien qui a déjà son site le connecte à son espace Harmony, HarmonyBot en lit quelques pages publiques pour
          comprendre son activité (présentation, spécialités, informations pratiques) et préparer ses contenus.
        </p>

        <h2 className="mt-12 text-xl font-bold text-ink-900">Ce qu&apos;il fait, et ce qu&apos;il ne fait pas</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed">
          {DOES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <h2 className="mt-12 text-xl font-bold text-ink-900">Le reconnaître</h2>
        <p className="mt-4 leading-relaxed">Dans les journaux de votre site, HarmonyBot apparaît sous cette identité :</p>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-900">
          <code>{USER_AGENT}</code>
        </pre>

        <h2 className="mt-12 text-xl font-bold text-ink-900">Lui interdire votre site</h2>
        <p className="mt-4 leading-relaxed">
          Ajoutez ces deux lignes au fichier <code>robots.txt</code> de votre site : HarmonyBot ne le lira plus.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-900">
          <code>{"User-agent: HarmonyBot\nDisallow: /"}</code>
        </pre>

        <h2 className="mt-12 text-xl font-bold text-ink-900">Une question ?</h2>
        <p className="mt-4 leading-relaxed">
          Si HarmonyBot a lu votre site sans que vous l&apos;ayez demandé, écrivez-nous depuis{" "}
          <a href="/#demo" className="font-medium text-primary-700 underline underline-offset-2">
            le formulaire de notre page d&apos;accueil
          </a>{" "}
          : nous arrêterons la lecture.
        </p>
      </main>

      <footer className="border-t border-cream-200 py-8">
        <p className="mx-auto max-w-3xl px-5 text-xs text-ink-500">
          © {new Date().getFullYear()} <Brand /> — Tous droits réservés.
        </p>
      </footer>
    </div>
  );
}
