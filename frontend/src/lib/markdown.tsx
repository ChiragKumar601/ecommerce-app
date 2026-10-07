import { Fragment, type ReactNode } from 'react';

/** Minimal, safe Markdown for content pages: paragraphs and **bold** only (no HTML). */
export function renderMarkdown(text: string): ReactNode {
  return text.split(/\n{2,}/).map((para, i) => (
    <p key={i} className="mb-4 leading-7 text-ink-soft">
      {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={j} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={j}>{part}</Fragment>,
      )}
    </p>
  ));
}
