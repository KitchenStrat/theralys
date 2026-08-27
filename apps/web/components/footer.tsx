const COLUMNS = [
  {
    title: "Explorer",
    links: [
      { href: "#fonctionnalites", label: "Fonctionnalités" },
      { href: "#tarifs", label: "Tarifs" },
      { href: "#simulateur", label: "Simulateur de revenus" },
      { href: "#temoignages", label: "Témoignages" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Commencer",
    links: [
      { href: "#demo", label: "Demander une démo" },
      { href: "https://app.harmony-web.fr", label: "Espace client" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-night-900 py-14 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-bold">
            <span className="wordmark">Harmony</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
            Sites et référencement pour thérapeutes et praticiens du bien-être.
            Votre présence en ligne, de A à Z.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-bold uppercase tracking-wide text-white/50">{column.title}</p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-white/75 transition hover:text-primary-300">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 px-5 pt-6">
        <p className="text-xs text-white/45">
          © {new Date().getFullYear()} Harmony — Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
