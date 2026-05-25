import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const RAG_ANSWER_MARKDOWN_CLASS = "rag-answer-markdown";

type AnswerMarkdownProps = {
  content: string;
};

export function AnswerMarkdown({ content }: AnswerMarkdownProps) {
  return (
    <div className={RAG_ANSWER_MARKDOWN_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
