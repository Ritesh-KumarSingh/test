import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface StreamingOutputProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

export function StreamingOutput({ content, isStreaming, className = '' }: StreamingOutputProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams
  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [content, isStreaming]);

  return (
    <div className={`streaming-output ${className}`}>
      <ReactMarkdown
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const inline = props.inline;
            
            return !inline && language ? (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: '16px 0',
                  borderRadius: '8px',
                  fontSize: '13px',
                  padding: '16px',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Style other markdown elements
          h1: ({ children }: any) => <h1 className="markdown-h1">{children}</h1>,
          h2: ({ children }: any) => <h2 className="markdown-h2">{children}</h2>,
          h3: ({ children }: any) => <h3 className="markdown-h3">{children}</h3>,
          p: ({ children }: any) => <p className="markdown-p">{children}</p>,
          ul: ({ children }: any) => <ul className="markdown-ul">{children}</ul>,
          ol: ({ children }: any) => <ol className="markdown-ol">{children}</ol>,
          li: ({ children }: any) => <li className="markdown-li">{children}</li>,
          blockquote: ({ children }: any) => <blockquote className="markdown-blockquote">{children}</blockquote>,
          a: ({ href, children }: any) => (
            <a href={href} className="markdown-link" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      
      {/* Blinking cursor during streaming */}
      {isStreaming && <span className="typewriter-cursor" />}
      
      {/* Invisible anchor for auto-scroll */}
      <div ref={endRef} />
    </div>
  );
}
