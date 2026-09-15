import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Harmony", template: "%s — Harmony" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Polices des sites publics — pour les aperçus « Typo » de l'éditeur */}
        <link
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Inter:wght@400;500;600&family=Lora:wght@600&family=Playfair+Display:wght@600&family=Figtree:wght@600&family=Libre+Baskerville:wght@700&family=Open+Sans:wght@400&family=Lato:wght@400&family=Source+Sans+3:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
