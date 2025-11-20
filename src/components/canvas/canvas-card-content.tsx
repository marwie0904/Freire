"use client";

import { useRef, useEffect, useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CubeLoader } from "@/components/ui/cube-loader";
import "katex/dist/katex.min.css";

interface CanvasCardContentProps {
  content: string;
}

export const CanvasCardContent = memo(function CanvasCardContent({ content }: CanvasCardContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [skeletonCount, setSkeletonCount] = useState(10);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate skeleton count based on container height - debounced for performance
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (content !== "Generating response..." || !containerRef.current) return;

    const updateSkeletonCount = () => {
      if (containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        // Each line is 12px (h-3) + 12px gap (space-y-3) = 24px total
        // Calculate how many lines fit in the container
        const lineCount = Math.floor(containerHeight / 24);
        setSkeletonCount(Math.max(lineCount, 5)); // Minimum 5 lines
      }
    };

    // Debounced resize handler to reduce re-renders
    const debouncedUpdate = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(updateSkeletonCount, 100);
    };

    // Initial calculation (immediate)
    updateSkeletonCount();

    // Watch for container resize (debounced)
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [content]);

  // Early returns AFTER all hooks
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full w-full text-center text-muted-foreground text-base">
        Double Click to <span className="font-bold mx-1">Chat</span> or <span className="font-bold mx-1">Edit</span>
      </div>
    );
  }

  // Show cube loader during generation
  if (content === "Generating response...") {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full w-full">
        <CubeLoader size="md" variant="primary" speed="normal" />
      </div>
    );
  }

  return (
    <ReactMarkdown
        remarkPlugins={[[remarkMath, { singleDollarTextMath: true }], remarkGfm]}
        rehypePlugins={[
          [rehypeKatex, {
            strict: false,
            trust: true,
            throwOnError: false
          }],
          rehypeRaw
        ]}
        components={{
        // Style code blocks
        code: ({ node, inline, className, children, ...props }: any) => {
          return inline ? (
            <code
              className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code
              className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto"
              {...props}
            >
              {children}
            </code>
          );
        },
        // Style tables
        table: ({ children, ...props }: any) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full divide-y divide-border" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ children, ...props }: any) => (
          <th className="px-3 py-2 bg-muted text-left text-xs font-semibold" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }: any) => (
          <td className="px-3 py-2 text-xs border-t border-border" {...props}>
            {children}
          </td>
        ),
        // Style headings
        h1: ({ children, ...props }: any) => (
          <h1 className="text-base font-bold" style={{ margin: 0, marginTop: '0.75rem', marginBottom: '0.5rem' }} {...props}>{children}</h1>
        ),
        h2: ({ children, ...props }: any) => (
          <h2 className="text-sm font-bold" style={{ margin: 0, marginTop: '0.5rem', marginBottom: '0.25rem' }} {...props}>{children}</h2>
        ),
        h3: ({ children, ...props }: any) => (
          <h3 className="text-sm font-semibold" style={{ margin: 0, marginTop: '0.5rem', marginBottom: '0.25rem' }} {...props}>{children}</h3>
        ),
        // Style paragraphs
        p: ({ children, ...props }: any) => (
          <p className="text-xs leading-relaxed" style={{ margin: 0, marginBottom: '0.5rem' }} {...props}>{children}</p>
        ),
        // Style lists
        ul: ({ children, ...props }: any) => (
          <ul className="list-disc list-inside text-xs space-y-1 mb-2" {...props}>{children}</ul>
        ),
        ol: ({ children, ...props }: any) => (
          <ol className="list-decimal list-inside text-xs space-y-1 mb-2" {...props}>{children}</ol>
        ),
        li: ({ children, ...props }: any) => (
          <li className="text-xs" {...props}>{children}</li>
        ),
        // Style blockquotes
        blockquote: ({ children, ...props }: any) => (
          <blockquote className="border-l-2 border-border pl-3 italic text-xs my-2" {...props}>
            {children}
          </blockquote>
        ),
        // Style links
        a: ({ children, href, ...props }: any) => (
          <a
            href={href}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        ),
        }}
      >
        {content}
      </ReactMarkdown>
  );
});
