"use client";

import { clsx } from "clsx";
import { ExternalLink, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { InlineSuccess } from "@/components/ds";
import { articleCopy, articleImageFileName, type ArticleCopy } from "@/lib/social/article-copy";

/**
 * Reprise d'un article sur le site du praticien (quand ce site est la
 * référence des outils) : « Copier l'article » et « Télécharger l'image ».
 * Partagé par la fenêtre d'un article du calendrier et par la page
 * « Modifier l'article ».
 */

/**
 * Écrit l'article dans le presse-papiers en texte mis en forme (HTML) et en
 * texte brut : un éditeur de site garde la mise en forme, un champ simple
 * reçoit le texte. Repli sur le texte brut seul si le navigateur refuse le
 * texte riche.
 *
 * `source` peut être une lecture en cours : l'écriture est demandée au
 * navigateur tout de suite, dans le geste du clic (Safari la refuse après une
 * attente), et le contenu lui est remis quand il arrive.
 */
export async function writeArticleToClipboard(source: Promise<ArticleCopy>): Promise<"rich" | "plain"> {
  if (typeof ClipboardItem === "function" && typeof navigator.clipboard?.write === "function") {
    try {
      const part = (key: keyof ArticleCopy, type: string) => source.then((copy) => new Blob([copy[key]], { type }));
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": part("html", "text/html"), "text/plain": part("text", "text/plain") }),
      ]);
      return "rich";
    } catch {
      // Texte riche refusé : repli ci-dessous (si c'est la lecture de l'article qui a échoué, son erreur y est relancée)
    }
  }
  const { text } = await source;
  await navigator.clipboard.writeText(text);
  return "plain";
}

/**
 * Enregistre l'image d'un article sur l'appareil, sous un nom tiré du titre.
 * L'image est lue par le navigateur (jamais par notre serveur : son adresse
 * peut avoir été collée par le praticien) ; `false` si son hébergeur ne le
 * permet pas depuis une autre origine — l'appelant propose alors de l'ouvrir.
 */
export async function saveArticleImage(imageUrl: string, title: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return false;
    const blob = await response.blob();
    if (blob.type !== "" && !blob.type.startsWith("image/")) return false;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = articleImageFileName(title, blob.type, imageUrl);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** Résultat de la dernière action, dit au praticien sous les boutons (une copie réussie ou non, une image enregistrée ou à ouvrir). */
export type ArticleExportNotice = {
  tone: "success" | "info" | "error";
  text: string;
  /** Image à ouvrir dans un nouvel onglet quand elle n'a pas pu être téléchargée */
  openImageUrl?: string;
};

const COPIED_RICH = "Article copié avec sa mise en forme : collez-le dans l'éditeur de votre site.";
const COPIED_PLAIN = "Article copié en texte simple : votre navigateur ne copie pas la mise en forme.";
const COPY_REFUSED = "Copie impossible — votre navigateur refuse l'accès au presse-papiers.";
const ARTICLE_UNAVAILABLE = "L'article n'a pas pu être chargé — réessayez dans un instant.";
const IMAGE_SAVED = "Image téléchargée.";
const IMAGE_BLOCKED = "Téléchargement direct impossible : ouvrez l'image, puis enregistrez-la (clic droit, « Enregistrer l'image sous »).";

/**
 * État et actions de « Copier l'article » et « Télécharger l'image ».
 * `loadSource` rend le titre et le texte (markdown) à copier : déjà en main
 * sur la page « Modifier l'article », lus à la demande depuis le calendrier.
 */
export function useArticleExport(loadSource: () => Promise<{ title: string; content: string }> | { title: string; content: string }) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [notice, setNotice] = useState<ArticleExportNotice | null>(null);

  async function copy() {
    setNotice(null);
    setCopying(true);
    let loaded = true;
    // Pas d'attente avant l'écriture : elle doit partir dans le geste du clic
    const source = Promise.resolve()
      .then(loadSource)
      .then(articleCopy, (error: unknown) => {
        loaded = false;
        throw error;
      });
    try {
      const mode = await writeArticleToClipboard(source);
      setNotice({ tone: mode === "rich" ? "success" : "info", text: mode === "rich" ? COPIED_RICH : COPIED_PLAIN });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: "error", text: loaded ? COPY_REFUSED : ARTICLE_UNAVAILABLE });
    } finally {
      setCopying(false);
    }
  }

  async function saveImage(imageUrl: string, title: string) {
    setNotice(null);
    setSavingImage(true);
    const saved = await saveArticleImage(imageUrl, title);
    setSavingImage(false);
    setNotice(
      saved
        ? { tone: "success", text: IMAGE_SAVED }
        : { tone: "info", text: IMAGE_BLOCKED, ...(/^https?:\/\//i.test(imageUrl) ? { openImageUrl: imageUrl } : {}) },
    );
  }

  return { copy, copying, copied, saveImage, savingImage, notice };
}

/**
 * Résultat de la dernière action (copie, téléchargement), annoncé aux lecteurs
 * d'écran : une réussite surgit avec sa coche, une information ou un refus
 * portent leur pictogramme — jamais la couleur seule.
 */
export function ArticleExportMessage({ notice, className }: { notice: ArticleExportNotice | null; className?: string }) {
  if (!notice) return null;
  if (notice.tone === "success") {
    return <InlineSuccess className={className}>{notice.text}</InlineSuccess>;
  }
  const error = notice.tone === "error";
  const Icon = error ? TriangleAlert : Info;
  return (
    <p
      className={clsx("flex items-start gap-2 text-ds-body", error ? "font-medium text-ds-danger-700" : "text-ds-ink-700", className)}
      role={error ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        {notice.text}
        {notice.openImageUrl ? (
          <>
            {" "}
            <a
              href={notice.openImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded font-semibold text-ds-brand-700 underline underline-offset-2 ds-focus"
            >
              Ouvrir l&apos;image
              <ExternalLink size={14} aria-hidden />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </>
        ) : null}
      </span>
    </p>
  );
}
