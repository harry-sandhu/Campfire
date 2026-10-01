"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders user Markdown. Raw HTML is not rendered, images are dropped and links open safely in a new tab. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{label}</a>,
          img: ({ alt }) => <span className="text-muted">[image: {alt || "omitted"}]</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
