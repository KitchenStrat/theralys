import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://harmony-web.fr"),
  title: "Harmony, la solution digitale tout-en-un des thérapeutes",
  description:
    "Site internet, blog SEO, fiche Google, réseaux sociaux, Google Ads et Meta Ads : Harmony s'occupe de toute la présence en ligne de votre cabinet et vous montre ce qu'elle vous rapporte.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Harmony, tout le digital de votre cabinet, enfin réuni",
    description:
      "Un seul espace pour votre site, votre blog, votre fiche Google, vos réseaux sociaux et votre publicité. Le travail est préparé pour vous, vous gardez la main.",
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
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Figtree:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
