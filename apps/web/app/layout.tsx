import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // L'adresse officielle est le `www` : les adresses canoniques et les aperçus de partage s'y rapportent
  metadataBase: new URL(SITE_URL),
  title: "Harmony, la solution digitale tout-en-un des thérapeutes",
  description:
    "Site internet, blog, fiche Google, réseaux sociaux et publicité : Harmony s'occupe de la présence en ligne de votre cabinet et vous montre ce qu'elle rapporte.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Harmony, tout le digital de votre cabinet, enfin réuni",
    description:
      "Un seul espace pour votre site, votre blog, votre fiche Google, vos réseaux sociaux et votre publicité. Le travail est préparé pour vous, vous gardez la main.",
    url: "/",
    siteName: SITE_NAME,
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
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght,SOFT@9..144,400..700,100&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
