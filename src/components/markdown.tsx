import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders page text. Raw HTML in the source is ignored, so content is safe to show.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-app">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
