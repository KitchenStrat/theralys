import ReactMarkdown from "react-markdown";

/** Rendu markdown sûr (pas de HTML brut) pour articles et pages de motifs. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="site-prose">
      <ReactMarkdown skipHtml>{content}</ReactMarkdown>
    </div>
  );
}
