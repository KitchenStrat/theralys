import type { Site } from "@theralys/db";

export function SiteFooter({ site }: { site: Site }) {
  return (
    <footer className="mt-16 border-t border-black/5 bg-[var(--site-soft)]/50 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center text-sm opacity-70">
        <p className="font-medium">{site.name}</p>
        <p>
          Ce site présente une activité de bien-être qui ne se substitue ni à un avis médical ni à
          un suivi par un professionnel de santé.
        </p>
        <p>
          Site créé avec{" "}
          <a
            href="https://theralys-web.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--site-primary)]"
          >
            Harmony
          </a>
        </p>
      </div>
    </footer>
  );
}
