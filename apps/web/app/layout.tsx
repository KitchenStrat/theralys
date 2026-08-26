import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://harmony-web.fr"),
  title: "Harmony — Votre site de thérapeute, créé et référencé pour vous",
  description:
    "Harmony crée le site professionnel de votre cabinet et le fait grandir sur Google : pages de spécialités, blog SEO automatisé, avis Google synchronisés. Vous soignez, on s'occupe du reste.",
  openGraph: {
    title: "Harmony — Sites & SEO pour thérapeutes",
    description:
      "Un site élégant, référencé et vivant pour votre cabinet — livré clé en main, sans aucune technique de votre côté.",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
