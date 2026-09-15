import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Polices des presets typo (paires titres + corps) — replis système dans lib/theme.ts.
            Le navigateur ne télécharge que les familles utilisées par le preset actif. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Open+Sans:wght@400;600;700&family=Playfair+Display:wght@500;600;700&family=Lato:wght@400;700&family=Figtree:wght@500;600;700&family=Inter:wght@400;500;600&family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
