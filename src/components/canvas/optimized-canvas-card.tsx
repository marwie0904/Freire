"use client";

import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CanvasCardContent } from "./canvas-card-content";
import { CanvasTextSelectionHandler } from "./canvas-text-selection-handler";
import { Id } from "../../../convex/_generated/dataModel";
import { Plus, Minus, ExternalLink, Trash2, Copy, GitBranch } from "lucide-react";
import { ChatBox } from "@/components/ui/chat-box";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LocalCard {
  _id: Id<"canvasCards">;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  branchNumber?: number;
}

interface OptimizedCanvasCardProps {
  card: LocalCard;
  selectedCardId: Id<"canvasCards"> | null;
  editingCardId: Id<"canvasCards"> | null;
  draggedCard: Id<"canvasCards"> | null;
  hoveredCard: Id<"canvasCards"> | null;
  isOnTop: boolean;
  onMouseDown: (e: React.MouseEvent, cardId: Id<"canvasCards">) => void;
  onCardClick: (e: React.MouseEvent) => void;
  onMouseEnter: (cardId: Id<"canvasCards">) => void;
  onMouseLeave: () => void;
  onContentChange: (cardId: Id<"canvasCards">, content: string) => void;
  onEscapePress: () => void;
  onResizeStart: (e: React.MouseEvent, cardId: Id<"canvasCards">) => void;
  cardTextareaRef: (el: HTMLTextAreaElement | null, cardId: Id<"canvasCards">) => void;
  conversationContext?: any[];
  model?: string;
  onCreateCardFromHighlight?: (content: string, sourceCardId: string) => void;
  // Chatbox props
  chatInput?: string;
  onChatInputChange?: (value: string) => void;
  onSendMessage?: (e: React.FormEvent) => void;
  isSendingMessage?: boolean;
  cardTokenUsage?: { totalOutputTokens: number; limit: number } | null;
  selectedModel?: { label: string; value: string };
  onModelChange?: (model: { label: string; value: string }) => void;
  modelOptions?: Array<{ label: string; value: string }>;
  onDeleteCard?: (cardId: Id<"canvasCards">) => void;
  onCopyContent?: () => void;
  onBranchCard?: (cardId: Id<"canvasCards">) => void;
  onSources?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onEditingChange?: (cardId: Id<"canvasCards">) => void;
  // File attachment props
  attachedFiles?: File[];
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile?: (index: number) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  isProcessingFiles?: boolean;
}

// Separate chatbox component that doesn't get memoized
function CanvasChatBox({
  card,
  selectedCardId,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isSendingMessage,
  selectedModel,
  onModelChange,
  modelOptions,
  attachedFiles,
  onFileSelect,
  onRemoveFile,
  isProcessingFiles,
  fileInputRef,
  cardTokenUsage,
  chatInputRef,
  onSources,
  onDeleteCard,
  onCopyContent,
}: any) {
  const [isChatboxFocused, setIsChatboxFocused] = useState(false);
  const [isChatboxHovered, setIsChatboxHovered] = useState(false);

  const isSelected = selectedCardId === card._id;

  if (!isSelected || !onSendMessage || !onChatInputChange || chatInput === undefined) {
    return null;
  }

  return (
    <div
      data-chatbox
      className="fixed bottom-0 left-0 right-0 flex justify-center px-8 pb-6 pointer-events-none"
      style={{
        zIndex: 1000,
      }}
    >
      <div
        className="pointer-events-auto w-full max-w-2xl transition-opacity"
        onMouseEnter={() => setIsChatboxHovered(true)}
        onMouseLeave={() => setIsChatboxHovered(false)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          opacity: (isChatboxFocused || isChatboxHovered) ? 1 : 0.5,
        }}
      >
      <ChatBox
        value={chatInput || ""}
        onChange={(value) => onChatInputChange?.(value)}
        onSubmit={(e) => {
          e.preventDefault();
          onSendMessage?.(e);
        }}
        selectedModel={selectedModel || { label: "FREIRE LITE", value: "openai/gpt-oss-20b" }}
        onModelChange={(model) => onModelChange?.(model)}
        modelOptions={modelOptions || []}
        attachedFiles={attachedFiles}
        onFileSelect={onFileSelect}
        onRemoveFile={onRemoveFile}
        isProcessingFiles={isProcessingFiles}
        fileInputRef={fileInputRef}
        tokenCount={cardTokenUsage ? {
          totalOutputTokens: cardTokenUsage.totalOutputTokens,
          limit: cardTokenUsage.limit,
          isLimitReached: cardTokenUsage.totalOutputTokens >= cardTokenUsage.limit
        } : undefined}
        isLoading={isSendingMessage}
        textareaRef={chatInputRef}
      />

      {/* Additional Action Buttons Below */}
      <div className="flex items-center justify-between mt-2 px-2">
        {/* Left: Sources */}
        {onSources && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSources}
            className="text-xs gap-1 h-7"
          >
            <ExternalLink className="h-3 w-3" />
            Sources
          </Button>
        )}

        {/* Right: Delete, Copy */}
        <div className="flex items-center gap-1">
          {onDeleteCard && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDeleteCard(card._id)}
              className="h-7 w-7"
              title="Delete card"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onCopyContent && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopyContent}
              className="h-7 w-7"
              title="Copy content"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// Non-memoized wrapper that handles zoom state
function CardWithZoom(props: OptimizedCanvasCardProps) {
  const [zoomLevel, setZoomLevel] = useState(100);

  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.min(prev + 5, 200));
  }, []);

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.max(prev - 5, 50));
  }, []);

  return <OptimizedCanvasCardInner {...props} zoomLevel={zoomLevel} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />;
}

interface OptimizedCanvasCardInnerProps extends OptimizedCanvasCardProps {
  zoomLevel: number;
  onZoomIn: (e: React.MouseEvent) => void;
  onZoomOut: (e: React.MouseEvent) => void;
}

const OptimizedCanvasCardInner = memo(function OptimizedCanvasCardInner({
  card,
  selectedCardId,
  editingCardId,
  draggedCard,
  hoveredCard,
  isOnTop,
  onMouseDown,
  onCardClick,
  onMouseEnter,
  onMouseLeave,
  onContentChange,
  onEscapePress,
  onResizeStart,
  cardTextareaRef,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  conversationContext,
  model,
  onCreateCardFromHighlight,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isSendingMessage,
  cardTokenUsage,
  selectedModel,
  onModelChange,
  modelOptions,
  onDeleteCard,
  onCopyContent,
  onBranchCard,
  onSources,
  chatInputRef,
  onEditingChange,
  attachedFiles,
  onFileSelect,
  onRemoveFile,
  fileInputRef,
  isProcessingFiles,
}: OptimizedCanvasCardInnerProps) {

  const isHovered = hoveredCard === card._id;
  const isSelected = selectedCardId === card._id;
  const isEditing = editingCardId === card._id;
  const isDragging = draggedCard === card._id;

  // Local state for textarea to avoid parent re-renders during typing
  const [localContent, setLocalContent] = useState(card.content);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local content when card content changes from external sources (streaming, etc.)
  // Only update if content changed AND we're not editing (to avoid overwriting during typing)
  useEffect(() => {
    if (card.content !== localContent && !isEditing) {
      setLocalContent(card.content);
    }
  }, [card.content, isEditing]); // Removed localContent from deps to avoid infinite loop

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    // Update local state immediately (fast, no parent re-render)
    setLocalContent(newValue);

    // Debounce the parent notification to avoid triggering parent logic on every keystroke
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      onContentChange(card._id, newValue);
    }, 150); // 150ms debounce - only notify parent after user pauses
  }, [card._id, onContentChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onEscapePress();
    }
  }, [onEscapePress]);

  const handleTextareaMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleCardMouseDown = useCallback((e: React.MouseEvent) => {
    onMouseDown(e, card._id);
  }, [card._id, onMouseDown]);

  const handleCardMouseEnter = useCallback(() => {
    onMouseEnter(card._id);
  }, [card._id, onMouseEnter]);

  return (
    <>
      {/* Container for card and chatbox - moves together */}
      <div
        className="absolute"
        data-card-id={card._id}
        style={{
          transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
          willChange: isDragging ? 'transform' : 'auto',
          zIndex: isOnTop ? 20 : 10,
        }}
      >
        {/* Zoom Controls - positioned above card at top-right */}
        {(isHovered || isSelected) && (
          <div
            className="absolute flex gap-1 z-30"
            style={{
              right: '0px',
              top: '-32px',
            }}
          >
            <button
              onClick={onZoomOut}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded bg-card border border-border hover:bg-accent flex items-center justify-center shadow-md transition-colors"
              title="Zoom out (5%)"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={onZoomIn}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded bg-card border border-border hover:bg-accent flex items-center justify-center shadow-md transition-colors"
              title="Zoom in (5%)"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Branch Number Label - positioned outside card at top-left */}
        {card.branchNumber && (
          <div
            className="absolute text-xs font-medium text-muted-foreground pointer-events-none z-30"
            style={{
              left: '0px',
              top: '-24px',
            }}
          >
            Branch #{card.branchNumber}
          </div>
        )}

        {/* Card */}
        <div
        key={card._id}
        onMouseDown={handleCardMouseDown}
        onClick={onCardClick}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={onMouseLeave}
        className="group rounded-lg bg-card shadow-lg hover:shadow-xl transition-shadow"
        style={{
          width: `${card.width}px`,
          height: `${card.height}px`,
          willChange: isHovered ? 'box-shadow' : 'auto',
          userSelect: isEditing ? 'text' : 'none',
          cursor: isDragging ? 'grabbing' : (isEditing ? 'text' : 'grab'),
          padding: '16px',
          border: isSelected ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
          boxSizing: 'border-box',
          contain: 'layout style paint',
          contentVisibility: 'auto',
        }}
      >

        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top left',
            width: `${100 / (zoomLevel / 100)}%`,
            height: `${100 / (zoomLevel / 100)}%`,
          }}
          className="h-full w-full"
          data-zoom-level={zoomLevel}
        >
          {isEditing && card.content !== "Generating response..." ? (
            conversationContext && model && onCreateCardFromHighlight ? (
              <CanvasTextSelectionHandler
                conversationContext={conversationContext}
                model={model}
                onCreateCard={onCreateCardFromHighlight}
                cardId={card._id}
              >
                <Textarea
                  ref={(el) => cardTextareaRef(el, card._id)}
                  value={localContent}
                  onChange={handleContentChange}
                  onKeyDown={handleKeyDown}
                  onMouseDown={handleTextareaMouseDown}
                  className="h-full w-full resize-none border-0 bg-transparent p-0 m-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 overflow-y-auto"
                  style={{
                    userSelect: 'text',
                    cursor: 'text',
                    boxSizing: 'border-box',
                    lineHeight: '1.5',
                    scrollMargin: 0,
                  }}
                />
              </CanvasTextSelectionHandler>
            ) : (
              <Textarea
                ref={(el) => cardTextareaRef(el, card._id)}
                value={localContent}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                onMouseDown={handleTextareaMouseDown}
                className="h-full w-full resize-none border-0 bg-transparent p-0 m-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 overflow-y-auto"
                style={{
                  userSelect: 'text',
                  cursor: 'text',
                  boxSizing: 'border-box',
                  lineHeight: '1.5',
                  scrollMargin: 0,
                }}
              />
            )
          ) : (
            <div
              className="h-full w-full overflow-y-auto text-sm"
              style={{
                boxSizing: 'border-box',
                lineHeight: '1.5',
                padding: 0,
                margin: 0,
              }}
            >
              {conversationContext && model && onCreateCardFromHighlight ? (
                <CanvasTextSelectionHandler
                  conversationContext={conversationContext}
                  model={model}
                  onCreateCard={onCreateCardFromHighlight}
                  cardId={card._id}
                >
                  <CanvasCardContent content={card.content} />
                </CanvasTextSelectionHandler>
              ) : (
                <CanvasCardContent content={card.content} />
              )}
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div
          data-resize-handle
          onMouseDown={(e) => onResizeStart(e, card._id)}
          className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{
            background: `linear-gradient(135deg, transparent 0%, transparent 50%, hsl(var(--primary)) 50%, hsl(var(--primary)) 100%)`,
          }}
        />
      </div>

      {/* Action Buttons - positioned outside card at bottom-right */}
      {(isHovered || isSelected) && (
        <div
          className="absolute flex gap-1 z-30"
          style={{
            right: '0px',
            bottom: '-40px',
          }}
        >
          {onCopyContent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyContent();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded bg-card border border-border hover:bg-accent flex items-center justify-center shadow-md transition-colors"
              title="Copy content"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {onDeleteCard && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCard(card._id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded bg-card border border-border hover:bg-accent hover:text-destructive flex items-center justify-center shadow-md transition-colors"
              title="Delete card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onBranchCard && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBranchCard(card._id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded bg-card border border-border hover:bg-accent flex items-center justify-center shadow-md transition-colors"
              title="Branch card"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  // Only re-render if this specific card or its related state changed

  // Quick exit: if card ID changed, definitely re-render
  if (prevProps.card._id !== nextProps.card._id) return false;

  // Check if this card is involved in any state changes
  const prevIsActive = prevProps.selectedCardId === prevProps.card._id ||
                       prevProps.editingCardId === prevProps.card._id ||
                       prevProps.draggedCard === prevProps.card._id ||
                       prevProps.hoveredCard === prevProps.card._id;

  const nextIsActive = nextProps.selectedCardId === nextProps.card._id ||
                       nextProps.editingCardId === nextProps.card._id ||
                       nextProps.draggedCard === nextProps.card._id ||
                       nextProps.hoveredCard === nextProps.card._id;

  // If card went from inactive to active or vice versa, re-render
  if (prevIsActive !== nextIsActive) return false;

  // If card is active, check all props carefully
  if (nextIsActive) {
    return (
      prevProps.card.x === nextProps.card.x &&
      prevProps.card.y === nextProps.card.y &&
      prevProps.card.width === nextProps.card.width &&
      prevProps.card.height === nextProps.card.height &&
      prevProps.card.content === nextProps.card.content &&
      prevProps.selectedCardId === nextProps.selectedCardId &&
      prevProps.editingCardId === nextProps.editingCardId &&
      prevProps.draggedCard === nextProps.draggedCard &&
      prevProps.hoveredCard === nextProps.hoveredCard &&
      prevProps.isOnTop === nextProps.isOnTop &&
      prevProps.zoomLevel === nextProps.zoomLevel &&
      prevProps.chatInput === nextProps.chatInput
    );
  }

  // If card is inactive, only re-render if position/size/content changed
  return (
    prevProps.card.x === nextProps.card.x &&
    prevProps.card.y === nextProps.card.y &&
    prevProps.card.width === nextProps.card.width &&
    prevProps.card.height === nextProps.card.height &&
    prevProps.card.content === nextProps.card.content &&
    prevProps.isOnTop === nextProps.isOnTop
  );
});

// Export the wrapper component
export const OptimizedCanvasCard = CardWithZoom;
