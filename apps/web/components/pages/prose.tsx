import { Fragment, type ReactNode } from "react";
import type { Block } from "@/content/blog";
import { rich } from "../rich";

const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

/**
 * Texte d'un contenu : `**gras**`, typographie française (via `rich`), et
 * liens internes écrits `[libellé](/adresse)` — internes seulement : une
 * adresse qui ne commence pas par `/` reste du texte.
 */
export function inline(text: string, options?: { strong?: string; link?: string }): ReactNode {
  const link = options?.link ?? "focus-ring rounded font-medium text-primary-700 underline decoration-primary-300 underline-offset-4 hover:text-primary-800 hover:decoration-primary-600";
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(<Fragment key={`t${start}`}>{rich(text.slice(last, start), options)}</Fragment>);
    parts.push(
      <a key={`a${start}`} href={match[2]} className={link}>
        {rich(match[1] ?? "", options)}
      </a>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{rich(text.slice(last), options)}</Fragment>);
  return parts;
}

/** Les blocs d'un contenu : paragraphes, listes, encadrés « à retenir ». */
export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (typeof block === "string") {
          return (
            <p key={index} className="mt-4 text-[1.0625rem] leading-[1.75] text-ink-700">
              {inline(block)}
            </p>
          );
        }
        if ("list" in block) {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index} className={`mt-4 space-y-2.5 pl-1 text-[1.0625rem] leading-[1.7] text-ink-700 ${block.ordered ? "list-decimal pl-6 marker:font-semibold marker:text-primary-700" : ""}`}>
              {block.list.map((item, itemIndex) =>
                block.ordered ? (
                  <li key={itemIndex} className="pl-1.5">
                    {inline(item)}
                  </li>
                ) : (
                  <li key={itemIndex} className="flex gap-3">
                    <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                    <span>{inline(item)}</span>
                  </li>
                ),
              )}
            </List>
          );
        }
        return (
          <p key={index} className="mt-6 rounded-2xl border border-primary-100 bg-primary-50 px-5 py-4 text-[1.0625rem] leading-[1.7] text-ink-900">
            {inline(block.note)}
          </p>
        );
      })}
    </>
  );
}
