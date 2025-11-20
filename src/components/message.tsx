"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FileText, Image as ImageIcon, Music, File, Download, Search, ChevronDown, ChevronUp, ExternalLink, BookOpen, Copy, RotateCcw, MoreVertical, FileDown } from "lucide-react";
import { WebSearchIndicator } from "./ui/web-search-indicator";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { TextSelectionHandler } from "./text-selection-handler";
import { FlagFeedback } from "./flag-feedback";
import { useSmoothStreaming } from "@/hooks/use-smooth-streaming";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useMemo, memo } from "react";
import "katex/dist/katex.min.css";

interface MessagePart {
  type: string;
  text?: string;
  [key: string]: any;
}

interface FileAttachment {
  storageId: Id<"_storage">;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
}

interface SearchMetadata {
  query: string;
  sources: SearchSource[];
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ReasoningDetail {
  id?: string | null;
  format?: string;
  [key: string]: any;
}

interface MessageProps {
  id?: string;
  role: "user" | "assistant";
  content?: string;
  parts?: MessagePart[];
  userInitials?: string;
  conversationContext?: any[];
  conversationId?: Id<"conversations">;
  model?: string;
  isStreaming?: boolean;
  attachments?: FileAttachment[];
  searchMetadata?: SearchMetadata;
  tokenUsage?: TokenUsage;
  reasoningDetails?: ReasoningDetail[];
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4" />;
  }
  if (fileType.startsWith("audio/")) {
    return <Music className="h-4 w-4" />;
  }
  if (
    fileType.includes("pdf") ||
    fileType.includes("document") ||
    fileType.includes("text")
  ) {
    return <FileText className="h-4 w-4" />;
  }
  return <File className="h-4 w-4" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentItem({ attachment }: { attachment: FileAttachment }) {
  const fileUrl = useQuery(api.messageFiles.getUrl, {
    storageId: attachment.storageId,
  });

  const isImage = attachment.fileType.startsWith("image/");

  const handleDownload = () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank");
    }
  };

  // Image preview card - just the image
  if (isImage && fileUrl) {
    return (
      <div className="inline-flex flex-col w-[150px] bg-secondary/30 rounded-lg border border-border/40 overflow-hidden group">
        <div className="relative w-full h-[150px] bg-black/20 flex items-center justify-center">
          <img
            src={fileUrl}
            alt={attachment.fileName}
            className="max-w-full max-h-full object-contain"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDownload}
          >
            <Download className="h-3 w-3 text-white" />
          </Button>
        </div>
      </div>
    );
  }

  // Non-image attachments (documents, audio) - show filename as preview
  return (
    <div className="inline-flex flex-col w-[150px] h-[150px] bg-secondary/30 rounded-lg border border-border/40 overflow-hidden group relative">
      <div className="relative w-full h-full flex flex-col items-center justify-center p-3">
        <div className="text-muted-foreground mb-2">{getFileIcon(attachment.fileType)}</div>
        <span className="text-xs font-medium text-foreground text-center break-words px-2">
          {attachment.fileName}
        </span>
        <span className="text-[10px] text-muted-foreground mt-1">
          {formatFileSize(attachment.fileSize)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleDownload}
          disabled={!fileUrl}
        >
          <Download className="h-3 w-3 text-white" />
        </Button>
      </div>
    </div>
  );
}

export const Message = memo(function Message({
  id,
  role,
  content,
  parts,
  userInitials = "MW",
  conversationContext = [],
  conversationId,
  model = "openai/gpt-oss-120b",
  isStreaming = false,
  attachments,
  searchMetadata,
  tokenUsage,
  reasoningDetails,
}: MessageProps) {
  const [showSources, setShowSources] = useState(true);
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Handle copy to clipboard
  const handleCopy = async () => {
    const textToCopy = content || parts
      ?.filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("");

    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle retry (placeholder)
  const handleRetry = () => {
    // TODO: Implement retry logic
    console.log("Retry clicked");
  };

  // Handle PDF export
  const handleExportPDF = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const html2canvas = (await import("html2canvas")).default;

      // Find the message content element
      const element = document.querySelector(`[data-message-id="${id}"]`);
      if (!element) {
        console.error("Message element not found");
        return;
      }

      // Convert to canvas
      const canvas = await html2canvas(element as HTMLElement, {
        scale: 2,
        backgroundColor: "#1a1a1a",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`message-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
    }
  };

  // Handle DOCX export
  const handleExportDOCX = async () => {
    try {
      const docx = await import("docx");
      const fileSaver = await import("file-saver");

      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
      const { saveAs } = fileSaver;

      // Parse markdown content to docx elements
      const paragraphs: any[] = [];
      const lines = displayContent.split("\n");

      for (const line of lines) {
        if (line.startsWith("# ")) {
          paragraphs.push(new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
          }));
        } else if (line.startsWith("## ")) {
          paragraphs.push(new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
          }));
        } else if (line.startsWith("### ")) {
          paragraphs.push(new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
          }));
        } else {
          paragraphs.push(new Paragraph({
            children: [new TextRun(line)],
          }));
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `message-${new Date().toISOString().slice(0, 10)}.docx`);
    } catch (error) {
      console.error("DOCX export failed:", error);
    }
  };

  // Debug logging (commented out)
  // console.log("[Message Component]", {
  //   role,
  //   hasSearchMetadata: !!searchMetadata,
  //   sourcesCount: searchMetadata?.sources?.length || 0,
  //   searchMetadata: searchMetadata,
  // });

  // Extract reasoning parts from message parts array
  const reasoningParts = useMemo(() => {
    if (parts && parts.length > 0) {
      return parts.filter((part) =>
        part.type === "reasoning" ||
        part.type === "reasoning.text" ||
        part.type?.startsWith("reasoning")
      );
    }
    return [];
  }, [parts]);

  // Handle both UIMessage format (parts) and simple format (content)
  // Memoize raw content extraction to avoid recalculation
  const rawContent = useMemo(() => {
    if (parts && parts.length > 0) {
      return parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("");
    }
    return content || "";
  }, [content, parts]);

  // Check for web search tool calls in parts
  const hasWebSearch = useMemo(() =>
    parts?.some((part) =>
      part.type === "tool-call" && part.toolName === "webSearch"
    ) || searchMetadata !== undefined,
    [parts, searchMetadata]
  );

  // Apply smooth streaming for assistant messages
  const streamedContent = useSmoothStreaming(rawContent, isStreaming);

  // Convert LaTeX delimiters from \( \) and \[ \] to $ $$ for remark-math
  // Memoize this transformation
  const displayContent = useMemo(() => {
    const contentToProcess = role === "assistant" ? streamedContent : rawContent;
    return contentToProcess
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$')
      .replace(/\\\[/g, '$$')
      .replace(/\\\]/g, '$$');
  }, [role, streamedContent, rawContent]);

  // Extract user question from conversation context (for flag feedback)
  const userQuestion = useMemo(() => {
    if (role !== "assistant" || !conversationContext.length) return "";

    // Find the message before this one
    const currentIndex = conversationContext.findIndex(msg => msg.id === id);
    if (currentIndex <= 0) return "";

    // Look backwards for the most recent user message
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (conversationContext[i].role === "user") {
        return conversationContext[i].content || "";
      }
    }
    return "";
  }, [role, conversationContext, id]);

  if (role === "user") {
    return (
      <div className="space-y-3">
        {attachments && attachments.length > 0 && (
          <div className="flex gap-3">
            <div className="w-8 shrink-0"></div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <AttachmentItem key={index} attachment={attachment} />
              ))}
            </div>
          </div>
        )}
        {displayContent && (
          <div className="rounded-2xl p-4 flex gap-3 bg-message-user">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {displayContent}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Add inline citations to content if sources are available
  // Memoize citation processing to avoid recalculation
  const contentWithCitations = useMemo(() => {
    let processedContent = displayContent;
    if (searchMetadata && searchMetadata.sources.length > 0) {
      // Track which citations have been used to avoid duplicates
      const citationsUsed = new Set<number>();

      // Create clickable inline citations
      searchMetadata.sources.forEach((source, idx) => {
        try {
          // Extract domain name without www.
          const domain = new URL(source.url).hostname.replace('www.', '');

          // Get a short name from the domain (e.g., "deloitte.com" -> "Deloitte")
          const sourceName = domain.split('.')[0];
          const capitalizedSourceName = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);

          // Also try to match common variations of the source name in content
          const sourceVariations = [
            domain, // deloitte.com
            sourceName, // deloitte
            capitalizedSourceName, // Deloitte
            source.title.split(' ').slice(0, 2).join(' '), // First 2 words of title
          ].filter(v => v && v.length > 2); // Skip very short words

          // Create markdown link with the source name
          const citation = ` [${capitalizedSourceName}](${source.url})`;

          // Try to find mentions of any source variation in the content
          for (const variation of sourceVariations) {
            // Look for the variation as a whole word (case insensitive)
            const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b(${escapedVariation})\\b(?!\\])(?!\\()`, 'gi');

            const matches = processedContent.match(regex);
            if (matches && !citationsUsed.has(idx)) {
              // Add citation after the first occurrence
              processedContent = processedContent.replace(regex, (match) => {
                if (!citationsUsed.has(idx)) {
                  citationsUsed.add(idx);
                  return `${match}${citation}`;
                }
                return match;
              });
              break; // Stop after first successful match for this source
            }
          }
        } catch (error) {
          console.error('Error processing citation:', error);
        }
      });
    }
    return processedContent;
  }, [displayContent, searchMetadata]);

  // AI messages - wrap with TextSelectionHandler
  return (
    <TextSelectionHandler
      conversationContext={conversationContext}
      model={model}
    >
      <div className="space-y-3" data-message-id={id}>
        {/* Web Search Indicator - Show when streaming and search was used, or after done with metadata */}
        {isStreaming && hasWebSearch && (
          <div className="bg-secondary/30 rounded-lg px-3 py-2 border border-border/40">
            <WebSearchIndicator />
          </div>
        )}
        {!isStreaming && hasWebSearch && !searchMetadata && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 border border-border/40">
            <Search className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span>Searched the web</span>
          </div>
        )}

        <div className="prose prose-invert max-w-none prose-sm">
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
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-4">
                  <table {...props} />
                </div>
              ),
            }}
          >
            {contentWithCitations}
          </ReactMarkdown>
        </div>

        {/* Reasoning Section - Shows BEFORE final answer during streaming */}
        {(reasoningParts.length > 0 || (reasoningDetails && reasoningDetails.length > 0)) && (
          <div className="border border-border/40 rounded-lg overflow-hidden mb-3">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full px-4 py-2 bg-secondary/20 hover:bg-secondary/30 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">💭 Chain of Thought</span>
                <span className="text-[10px] text-muted-foreground">
                  {isStreaming ? "thinking..." : `(${reasoningParts.length || reasoningDetails?.length || 0} blocks)`}
                </span>
              </div>
              {showReasoning ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showReasoning && (
              <div className="p-4 bg-secondary/10 max-h-[400px] overflow-y-auto space-y-2">
                {/* Show streaming reasoning parts first (live) */}
                {reasoningParts.map((part, idx) => (
                  <div key={idx} className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {part.text}
                  </div>
                ))}
                {/* Fallback to saved reasoningDetails if no parts */}
                {reasoningParts.length === 0 && reasoningDetails?.map((detail, idx) => (
                  <div key={detail.id || idx} className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {detail.text || JSON.stringify(detail, null, 2)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between gap-2 pt-2">
          {/* Left side - Sources button */}
          <div className="flex items-center gap-2">
            {searchMetadata && searchMetadata.sources.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{searchMetadata.sources.length} source{searchMetadata.sources.length !== 1 ? 's' : ''}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="start">
                  <div className="px-4 py-3 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Sources</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Search: {searchMetadata.query}
                    </p>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {searchMetadata.sources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/20 last:border-0 group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                {source.title}
                              </span>
                              <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {new URL(source.url).hostname}
                            </div>
                            {source.snippet && (
                              <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2">
                                {source.snippet}
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Right side - Action icons - Only show when not streaming */}
          {!isStreaming && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
                title="Copy message"
              >
                {copied ? (
                  <span className="text-xs">✓</span>
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>

              {/* 3-dot menu for more actions - TEMPORARILY HIDDEN */}
              {/* <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="More options"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleRetry}>
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    Regenerate
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FileDown className="h-3.5 w-3.5 mr-2" />
                      Export
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={handleExportPDF}>
                        PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportDOCX}>
                        DOCX
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu> */}

              <FlagFeedback
                messageId={id}
                conversationId={conversationId}
                userQuestion={userQuestion}
                aiResponse={rawContent}
                aiModel={model}
              />
            </div>
          )}
        </div>
      </div>
    </TextSelectionHandler>
  );
});
