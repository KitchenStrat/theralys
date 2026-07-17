import type { Site } from "@theralys/db";

export function SiteFooter({ site }: { site: Site }) {
  return (
    <footer className="border-t border-white/10 bg-[var(--site-deep)] py-10 text-[var(--site-on-deep)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
          {site.name}
        </p>
        <p className="max-w-xl text-sm opacity-70">
          Ce site présente une activité de bien-être qui ne se substitue ni à un avis médical ni à
          un suivi par un professionnel de santé.
        </p>
        <p className="text-sm opacity-70">
          © {new Date().getFullYear()} {site.name} · Site créé avec{" "}
          <a
            href="https://harmony-web.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-100"
          >
            Harmony
          </a>
        </p>
      </div>
    </footer>
  );
}
