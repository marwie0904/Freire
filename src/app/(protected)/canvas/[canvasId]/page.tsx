"use client";

import { useState, useEffect, useRef, useMemo, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PanelLeft, ArrowUp, ExternalLink, Trash2, Copy, Plus, Timer, ListChecks, ChevronDown, SquarePlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { CanvasCardContent } from "@/components/canvas/canvas-card-content";
import { CanvasConnections } from "@/components/canvas/canvas-connections";
import { TokenProgressCircle } from "@/components/token-progress-circle";
import { OptimizedCanvasCard } from "@/components/canvas/optimized-canvas-card";
import { CanvasSkeleton } from "@/components/canvas/canvas-skeleton";
import { calculateViewportBounds, isCardInViewport } from "@/lib/canvas-utils";
import { ChatBox } from "@/components/ui/chat-box";
import { useFileValidation } from "@/hooks/use-file-validation";
import { uploadFilesToConvex, FileAttachment } from "@/lib/upload-files";
import { FileAttachmentCard } from "@/components/file-attachment-card";
import { useConvex } from "convex/react";
import { ProtectedLayout } from "@/components/auth/protected-layout";

interface LocalCard {
  _id: Id<"canvasCards">;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  branchNumber?: number;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    attachments?: Array<{
      storageId: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }>;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}

export default function CanvasDetailPage() {
  const params = useParams();
  const router = useRouter();
  const canvasId = params.canvasId as Id<"canvases">;
  const canvas = useQuery(api.canvases.get, { id: canvasId });
  const canvasCards = useQuery(api.canvasCards.list, { canvasId });
  const convex = useConvex();
  const { fileTypeError, validateFiles } = useFileValidation();

  const createCard = useMutation(api.canvasCards.create);
  const updateCardPosition = useMutation(api.canvasCards.updatePosition);
  const updateCardContent = useMutation(api.canvasCards.updateContent);
  const addCardMessage = useMutation(api.canvasCards.addMessage);
  const removeCard = useMutation(api.canvasCards.remove);
  const branchCard = useMutation(api.canvasCards.branch);
  const createConnection = useMutation(api.canvasConnections.create);
  const connections = useQuery(api.canvasConnections.listByCanvas, { canvasId });
  const generateUploadUrl = useMutation(api.messageFiles.generateUploadUrl);

  // Local state for all cards (performance optimization)
  const [localCards, setLocalCards] = useState<LocalCard[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [useHighReasoning, setUseHighReasoning] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState<Id<"canvasCards"> | null>(null);
  const [editingCardId, setEditingCardId] = useState<Id<"canvasCards"> | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [draggedCard, setDraggedCard] = useState<Id<"canvasCards"> | null>(null);
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [cardDragStart, setCardDragStart] = useState({ x: 0, y: 0, cardX: 0, cardY: 0 });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<Id<"conversations"> | null>(null);
  const [resizingCard, setResizingCard] = useState<Id<"canvasCards"> | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, cardX: 0, cardY: 0 });
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const cardTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const isResizingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const latestResizeDimensions = useRef<{ width: number; height: number } | null>(null);
  const latestDragPosition = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null); // For requestAnimationFrame
  const pendingUpdateRef = useRef<(() => void) | null>(null); // Store pending updates

  // CSS transform-based dragging - stores offset without triggering re-renders
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedCardElementRef = useRef<HTMLElement | null>(null);
  const [selectedModel, setSelectedModel] = useState({ label: "FREIRE", value: "openai/gpt-oss-20b" });

  const MODEL_OPTIONS = [
    { label: "FREIRE", value: "openai/gpt-oss-20b" },
    { label: "FREIRE", value: "openai/gpt-oss-120b" },
    { label: "FREIRE +", value: "kimi/k2-thinking" },
  ];

  // Load saved model from localStorage on mount (client-side only)
  useEffect(() => {
    const savedModelValue = localStorage.getItem('selectedCanvasModel');
    if (savedModelValue) {
      const savedModel = MODEL_OPTIONS.find(m => m.value === savedModelValue);
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    }
  }, []);

  // Save selected model to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedCanvasModel', selectedModel.value);
  }, [selectedModel]);

  // Get token usage for the selected card (skip if temp ID)
  const cardTokenUsage = useQuery(
    api.canvasCards.getTokenUsage,
    selectedCardId && !selectedCardId.startsWith('temp-') ? { cardId: selectedCardId } : "skip"
  );

  // Canvas constants
  const CANVAS_WIDTH = 10000;
  const CANVAS_HEIGHT = 10000;
  const CANVAS_CENTER_X = CANVAS_WIDTH / 2;  // 5000
  const CANVAS_CENTER_Y = CANVAS_HEIGHT / 2; // 5000

  // Canvas pan and zoom state
  // Initialize offset to null - will be set to centered position on mount
  const [canvasOffset, setCanvasOffset] = useState<{ x: number; y: number } | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const savingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [hoveredCard, setHoveredCard] = useState<Id<"canvasCards"> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [topCardId, setTopCardId] = useState<Id<"canvasCards"> | null>(null); // Track which card should be on top

  // Use transitions for non-urgent state updates
  const [isPending, startTransition] = useTransition();

  // Viewport dimensions for virtualization
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Track viewport size for virtualization
  useEffect(() => {
    const updateViewportSize = () => {
      if (viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

  // Calculate visible cards (viewport culling for performance)
  const visibleCards = useMemo(() => {
    if (!canvasOffset || viewportSize.width === 0) {
      return localCards; // Show all cards if viewport not initialized
    }

    const bounds = calculateViewportBounds(
      viewportSize.width,
      viewportSize.height,
      canvasOffset,
      canvasZoom,
      500 // 500px buffer to render cards slightly off-screen
    );

    return localCards.filter(card => isCardInViewport(card, bounds));
  }, [localCards, canvasOffset, canvasZoom, viewportSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving) {
          handleSaveCanvas();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, isSaving]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Initialize canvas view to center on canvas center (5000, 5000)
  useEffect(() => {
    if (canvasOffset !== null) return; // Already initialized

    console.log('Attempting to initialize canvas...');

    // Use a small timeout to ensure DOM is ready
    const timer = setTimeout(() => {
      const viewportElement = document.querySelector('.relative.h-full.w-full.overflow-hidden');
      if (!viewportElement) {
        console.log('Viewport element not found');
        // Force initialization with default values if viewport not found
        const defaultOffsetX = 400 - CANVAS_CENTER_X; // Assume 800px viewport width
        const defaultOffsetY = 400 - CANVAS_CENTER_Y; // Assume 800px viewport height
        setCanvasOffset({ x: defaultOffsetX, y: defaultOffsetY });
        return;
      }

      const rect = viewportElement.getBoundingClientRect();
      console.log('Viewport rect:', rect);

      if (rect.width === 0 || rect.height === 0) {
        console.log('Viewport has no dimensions');
        // Force initialization with default values
        const defaultOffsetX = 400 - CANVAS_CENTER_X;
        const defaultOffsetY = 400 - CANVAS_CENTER_Y;
        setCanvasOffset({ x: defaultOffsetX, y: defaultOffsetY });
        return;
      }

      const viewportCenterX = rect.width / 2;
      const viewportCenterY = rect.height / 2;

      // Calculate offset so that canvas center (5000, 5000) appears at viewport center
      // Canvas point 5000,5000 should appear at screen position viewportCenterX, viewportCenterY
      // Screen position = offset + (canvas point * zoom)
      // So: offset = screen position - (canvas point * zoom)
      const initialOffsetX = viewportCenterX - (CANVAS_CENTER_X * canvasZoom);
      const initialOffsetY = viewportCenterY - (CANVAS_CENTER_Y * canvasZoom);

      console.log('Initializing canvas center:', {
        canvasCenter: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y },
        viewportCenter: { x: viewportCenterX, y: viewportCenterY },
        offset: { x: initialOffsetX, y: initialOffsetY }
      });

      setCanvasOffset({ x: initialOffsetX, y: initialOffsetY });
    }, 50);

    return () => clearTimeout(timer);
  }, [canvasOffset, canvasZoom, CANVAS_CENTER_X, CANVAS_CENTER_Y]);

  // Sync Convex data to local state - ONLY on initial load
  // Calculate branch numbers based on connections
  const calculateBranchNumbers = useCallback((cards: any[], connections: any[] | undefined) => {
    if (!connections) return cards;

    // Create a map of target card IDs to their incoming connections
    const incomingConnections = new Map<Id<"canvasCards">, number>();

    connections.forEach(conn => {
      const currentCount = incomingConnections.get(conn.targetCardId) || 0;
      incomingConnections.set(conn.targetCardId, currentCount + 1);
    });

    // Assign branch numbers to cards
    return cards.map(card => ({
      ...card,
      branchNumber: incomingConnections.get(card._id),
    }));
  }, []);

  useEffect(() => {
    // Only sync once on initial load, then manual save controls everything
    if (hasInitiallyLoaded) {
      return;
    }

    if (canvasCards && canvasCards.length > 0) {
      // Use transition for initial card loading (non-urgent)
      startTransition(() => {
        const cardsWithBranchNumbers = calculateBranchNumbers(
          canvasCards.map(card => ({
            _id: card._id,
            x: card.x,
            y: card.y,
            width: card.width,
            height: card.height,
            content: card.content,
            conversationHistory: card.conversationHistory,
          })),
          connections
        );
        setLocalCards(cardsWithBranchNumbers);
        setHasInitiallyLoaded(true);
      });
    }
  }, [canvasCards, hasInitiallyLoaded, connections, calculateBranchNumbers]);

  // Log chatbox visibility changes
  useEffect(() => {
    const selectedCard = localCards.find(c => c._id === selectedCardId);
    console.log('Chatbox effect triggered:', {
      selectedCardId,
      editingCardId,
      foundCard: !!selectedCard,
      localCardsCount: localCards.length
    });

    if (selectedCard && editingCardId === selectedCard._id) {
      console.log('Chatbox visible (edit mode - 100% opacity)');
    } else if (selectedCard) {
      console.log('Chatbox visible (view mode - 50% opacity)');
    } else {
      console.log('Chatbox hidden');
    }
  }, [selectedCardId, editingCardId, localCards]);

  // Save single card to database
  const saveCardToDatabase = async (cardId: Id<"canvasCards">) => {
    const localCard = localCards.find(c => c._id === cardId);
    if (!localCard) {
      return;
    }

    // Clear any existing timeout
    if (savingTimeoutRef.current) {
      clearTimeout(savingTimeoutRef.current);
    }

    // Block sync during save and for a short period after
    setIsSaving(true);

    try {
      await updateCardPosition({
        id: localCard._id,
        x: localCard.x,
        y: localCard.y,
        width: localCard.width,
        height: localCard.height,
      });

      // Keep blocking sync for 500ms after save completes
      savingTimeoutRef.current = setTimeout(() => {
        setIsSaving(false);
      }, 500);
    } catch (error) {
      setIsSaving(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  const lastClickedCardRef = useRef<Id<"canvasCards"> | null>(null);

  // Card drag handlers using mouse events (smooth like canvas pan)
  const handleCardMouseDown = (e: React.MouseEvent, cardId: Id<"canvasCards">) => {
    if (e.button !== 0 || resizingCard) return; // Only left click

    // Check if clicking on resize handle
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-resize-handle')) return;

    // DON'T preventDefault - it blocks onClick events
    e.stopPropagation(); // Prevent canvas pan

    const card = localCards.find(c => c._id === cardId);
    if (!card) return;

    // Capture the card element for direct DOM manipulation during drag
    // Walk up from target to find the card container
    let element = target;
    while (element && !element.hasAttribute('data-card-id')) {
      element = element.parentElement as HTMLElement;
    }
    if (element) {
      draggedCardElementRef.current = element;
    }

    // Bring clicked card to front
    setTopCardId(cardId);

    isDraggingRef.current = true;
    setIsDragging(false);
    setDraggedCard(cardId);
    setCardDragStart({
      x: e.clientX,
      y: e.clientY,
      cardX: card.x,
      cardY: card.y
    });
  };

  const handleCardMouseMove = (e: MouseEvent) => {
    if (!draggedCard || !draggedCardElementRef.current) return;

    const deltaX = e.clientX - cardDragStart.x;
    const deltaY = e.clientY - cardDragStart.y;

    // Mark as dragging if moved more than 5px in screen space (before zoom)
    const hasMoved = Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5;
    if (hasMoved && !isDragging) {
      setIsDragging(true);
    }

    // Only update position if actually dragging
    if (isDragging || hasMoved) {
      const newX = cardDragStart.cardX + deltaX / canvasZoom;
      const newY = cardDragStart.cardY + deltaY / canvasZoom;

      // Get card dimensions to constrain to canvas bounds
      const card = localCards.find(c => c._id === draggedCard);
      if (!card) return;

      // Clamp card position to stay within canvas bounds (0 to CANVAS_WIDTH/HEIGHT)
      const clampedX = Math.max(0, Math.min(CANVAS_WIDTH - card.width, newX));
      const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT - card.height, newY));

      // Calculate the offset from the card's original position
      const offsetX = clampedX - cardDragStart.cardX;
      const offsetY = clampedY - cardDragStart.cardY;

      // Store latest position in ref for final state update
      latestDragPosition.current = { x: clampedX, y: clampedY };
      dragOffsetRef.current = { x: offsetX, y: offsetY };

      // Use requestAnimationFrame for smooth 60fps updates
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          // Update local state so connections follow the card
          setLocalCards(prev => prev.map(c =>
            c._id === draggedCard ? { ...c, x: clampedX, y: clampedY } : c
          ));

          rafIdRef.current = null;
        });
      }
    }
  };

  const handleCardMouseUp = async () => {
    if (!draggedCard) return;

    const cardToSave = draggedCard;
    const wasDragging = isDragging;

    // CRITICAL: Use ref to get the latest position (not stale state)
    const latestPosition = latestDragPosition.current;

    // Always reset drag state, even if no position
    isDraggingRef.current = false;
    setDraggedCard(null);
    setIsDragging(false);
    latestDragPosition.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
    draggedCardElementRef.current = null;

    // If no actual drag happened (just a click), handle click detection
    if (!wasDragging) {
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;
      const isSameCard = lastClickedCardRef.current === cardToSave;

      // Double click detection: within 300ms and same card
      if (timeSinceLastClick < 300 && isSameCard) {
        console.log('Double click');
        console.log('Enter edit mode');
        setSelectedCardId(cardToSave);
        setEditingCardId(cardToSave);
        setHasUnsavedChanges(true);

        // Focus the card's textarea after it renders
        setTimeout(() => {
          const textarea = cardTextareaRefs.current.get(cardToSave);
          if (textarea) {
            textarea.focus();
            // Move cursor to end of text
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          }
        }, 50);

        // Reset for next double click
        lastClickTimeRef.current = 0;
        lastClickedCardRef.current = null;
      } else {
        // Single click behavior
        console.log('Single click');
        setSelectedCardId(cardToSave);

        // If already in edit mode on this card, stay in edit mode
        // Otherwise, exit edit mode (view only)
        if (editingCardId !== cardToSave) {
          console.log('Exit edit mode');
          setEditingCardId(null);
        } else {
          console.log('Already in edit mode - staying in edit mode');
        }

        lastClickTimeRef.current = now;
        lastClickedCardRef.current = cardToSave;
      }

      return;
    }

    // If drag actually happened, update state with final position
    if (wasDragging && latestPosition) {
      const finalX = latestPosition.x;
      const finalY = latestPosition.y;

      // Now update React state with final position (single update after drag)
      setLocalCards(prev => prev.map(c =>
        c._id === cardToSave ? { ...c, x: finalX, y: finalY } : c
      ));
      setHasUnsavedChanges(true);
    }
  };

  const handleNewCardDragStart = (e: React.DragEvent) => {
    console.log('Drag start initiated');

    // Set drag data to enable drop
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', 'new-card');

    setIsDraggingNew(true);
  };

  const handleNewCardDragEnd = (e: React.DragEvent) => {
    console.log('Drag end - dropEffect:', e.dataTransfer.dropEffect);
    setIsDraggingNew(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // Log mouse position during drag (this runs frequently)
    if (isDraggingNew) {
      console.log('Mouse position:', { x: e.clientX, y: e.clientY });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();

    console.log('handleDrop called - isDraggingNew:', isDraggingNew);

    if (isDraggingNew) {
      // The drop happens on the viewport container (not the transformed canvas)
      const viewportElement = e.currentTarget as HTMLElement;
      const viewportRect = viewportElement.getBoundingClientRect();

      // Get mouse position in viewport
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // Convert viewport coordinates to canvas local coordinates
      // Step 1: Get position relative to viewport
      const relativeX = mouseX - viewportRect.left;
      const relativeY = mouseY - viewportRect.top;

      // Step 2: Reverse the canvas transform (zoom and pan)
      // The canvas is transformed by: translate(offsetX, offsetY) scale(zoom)
      // To reverse: (relativePos - offset) / zoom
      const cardWidth = 400;
      const cardHeight = 300;

      const canvasX = (relativeX - (canvasOffset?.x || 0)) / canvasZoom;
      const canvasY = (relativeY - (canvasOffset?.y || 0)) / canvasZoom;

      // Center card on cursor
      let x = canvasX - (cardWidth / 2);
      let y = canvasY - (cardHeight / 2);

      // Clamp to canvas bounds (0 to CANVAS_WIDTH/HEIGHT)
      x = Math.max(0, Math.min(CANVAS_WIDTH - cardWidth, x));
      y = Math.max(0, Math.min(CANVAS_HEIGHT - cardHeight, y));

      // Calculate card center position
      const cardCenterX = x + (cardWidth / 2);
      const cardCenterY = y + (cardHeight / 2);

      console.log('Card center position:', { x: cardCenterX, y: cardCenterY });
      console.log('Debug info:', {
        mouse: { x: mouseX, y: mouseY },
        viewportRect: { left: viewportRect.left, top: viewportRect.top },
        relative: { x: relativeX, y: relativeY },
        offset: canvasOffset,
        zoom: canvasZoom,
        canvas: { x: canvasX, y: canvasY },
        cardTopLeft: { x, y }
      });

      // Generate temporary ID for instant local rendering
      const tempId = `temp-${Date.now()}` as Id<"canvasCards">;

      // INSTANTLY add to local state first (snappy UI)
      setLocalCards(prev => [...prev, {
        _id: tempId,
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        content: "",
      }]);

      setIsDraggingNew(false);

      // Create in database in background
      try {
        const newCardId = await createCard({
          canvasId,
          x,
          y,
          width: cardWidth,
          height: cardHeight,
          content: "",
        });

        console.log('Card created');

        // Replace temp ID with real ID
        setLocalCards(prev => prev.map(card =>
          card._id === tempId ? { ...card, _id: newCardId } : card
        ));

        setHasUnsavedChanges(false); // New card is already saved
      } catch (error) {
        console.log('Failed to create card');
        // Remove temp card on error
        setLocalCards(prev => prev.filter(card => card._id !== tempId));
      }
    } else {
      console.log('No card created - not dragging new card');
    }
  };

  const handleResizeStart = (e: React.MouseEvent, cardId: Id<"canvasCards">) => {
    e.preventDefault();
    e.stopPropagation();
    const card = localCards.find(c => c._id === cardId);
    if (card) {
      isResizingRef.current = true;
      setResizingCard(cardId);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: card.width,
        height: card.height,
        cardX: card.x,
        cardY: card.y,
      });
    }
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingCard) return;

    const deltaX = (e.clientX - resizeStart.x) / canvasZoom;
    const deltaY = (e.clientY - resizeStart.y) / canvasZoom;

    const newWidth = Math.max(150, resizeStart.width + deltaX);
    const newHeight = Math.max(100, resizeStart.height + deltaY);

    // Store latest dimensions in ref for save
    latestResizeDimensions.current = { width: newWidth, height: newHeight };

    // Use requestAnimationFrame for smooth 60fps updates
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        // Update local state optimistically (no database save during resize)
        setLocalCards(prev => prev.map(card =>
          card._id === resizingCard ? { ...card, width: newWidth, height: newHeight } : card
        ));
        rafIdRef.current = null;
      });
    }
  };

  const handleResizeEnd = async () => {
    if (!resizingCard) return;

    const cardToSave = resizingCard;

    // CRITICAL: Use ref to get the latest dimensions (not stale state)
    const latestDimensions = latestResizeDimensions.current;

    if (!latestDimensions) {
      isResizingRef.current = false;
      setResizingCard(null);
      return;
    }

    const finalWidth = latestDimensions.width;
    const finalHeight = latestDimensions.height;

    // Reset resize state
    isResizingRef.current = false;
    setResizingCard(null);
    latestResizeDimensions.current = null;

    // Update local state with final dimensions
    setLocalCards(prev => prev.map(card =>
      card._id === cardToSave ? { ...card, width: finalWidth, height: finalHeight } : card
    ));
    setHasUnsavedChanges(true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedCardId || isSendingMessage) return;

    // Prevent sending messages to temporary cards that haven't been created in the database yet
    if (selectedCardId.startsWith('temp-')) {
      console.log('Cannot send message to temporary card. Please wait for card creation to complete.');
      return;
    }

    const userMessage = chatInput.trim();
    const currentCardId = selectedCardId; // Capture for closure
    setChatInput("");
    setIsSendingMessage(true);

    // Show "Generating response..." in the card
    setLocalCards(prev => prev.map(card =>
      card._id === currentCardId ? { ...card, content: "Generating response..." } : card
    ));

    try {
      // Upload files if any
      let fileAttachments: FileAttachment[] | undefined;
      if (attachedFiles.length > 0) {
        setIsProcessingFiles(true);
        const uploadResult = await uploadFilesToConvex(attachedFiles, () =>
          convex.mutation(api.messageFiles.generateUploadUrl)
        );

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to upload files");
        }

        fileAttachments = uploadResult.attachments;
        setAttachedFiles([]); // Clear attached files after successful upload
        setIsProcessingFiles(false);
      }

      // Add user message and get the updated conversation history
      const conversationHistory = await addCardMessage({
        id: currentCardId,
        role: "user",
        content: userMessage,
        attachments: fileAttachments,
      });

      if (!conversationHistory || conversationHistory.length === 0) {
        throw new Error("No messages in conversation history");
      }

      // Build messages array for chat-v2 endpoint (just role and content, no attachments)
      const messages = conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Extract attachments from the last message (if it's the user message we just added)
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      const messageAttachments = lastMessage?.role === 'user' ? lastMessage.attachments : undefined;

      console.log('📤 [Canvas] Sending messages to chat-v2:', {
        messageCount: messages.length,
        lastMessage: messages[messages.length - 1],
        attachments: messageAttachments,
      });

      // Call the SAME chat-v2 endpoint as normal conversation
      const response = await fetch("/api/chat-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: selectedModel.value,
          useHighReasoning,
          attachments: messageAttachments,
        }),
      });

      // Read stream manually
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("No response body");
      }

      let fullText = '';
      let hasStartedStreaming = false;
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

      console.log('🚀 [Canvas Stream] Starting stream reading...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('✅ [Canvas Stream] Stream completed');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        // Parse AI SDK stream format: 0:"text" and e:metadata
        const lines = chunk.split('\n').filter(line => line.trim());
        for (const line of lines) {
          // Handle text chunks
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.substring(2));
              fullText += text;

              // Once we start receiving content, switch from skeleton to streaming text
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                console.log('📤 [Canvas Stream] First chunk received, switching to streaming mode');
              }

              // Update card content in real-time
              setLocalCards(prev => prev.map(card =>
                card._id === currentCardId ? { ...card, content: fullText } : card
              ));
            } catch (e) {
              console.warn('Failed to parse chunk:', line);
            }
          }
          // Handle metadata chunks (token usage)
          else if (line.startsWith('e:')) {
            try {
              const metadata = JSON.parse(line.substring(2));
              if (metadata.tokenUsage) {
                tokenUsage = metadata.tokenUsage;
                console.log('📊 [Canvas Stream] Received token usage:', tokenUsage);
              }
            } catch (e) {
              console.warn('Failed to parse metadata:', line);
            }
          }
        }
      }

      // Add assistant message to conversation history with token usage
      if (fullText) {
        await addCardMessage({
          id: currentCardId,
          role: "assistant",
          content: fullText,
          tokenUsage,
        });

        // Auto-resize card after streaming completes
        setLocalCards(prev => prev.map(card => {
          if (card._id === currentCardId) {
            // Auto-resize card to max 350x500
            const newWidth = Math.min(Math.max(card.width, 350), 350);
            const newHeight = Math.min(Math.max(card.height, 500), 500);

            return {
              ...card,
              content: fullText,
              width: newWidth,
              height: newHeight
            };
          }
          return card;
        }));

        // Mark as having unsaved changes (will save when user clicks "Save Changes")
        setHasUnsavedChanges(true);
      }
    } catch (error) {
      console.error('Canvas streaming error:', error);
      // Clear loading state on error
      setLocalCards(prev => prev.map(card =>
        card._id === currentCardId ? { ...card, content: "Error generating response. Please try again." } : card
      ));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSelectConversation = (id: Id<"conversations">) => {
    setActiveConversationId(id);
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleDeleteCard = async (cardId: Id<"canvasCards">) => {
    // Update local state first
    setLocalCards(prev => prev.filter(card => card._id !== cardId));
    // Save to database immediately
    await removeCard({ id: cardId });
    setSelectedCardId(null);
  };

  const handleCopyContent = async () => {
    if (!selectedCardId) return;

    const card = localCards.find(c => c._id === selectedCardId);
    if (card?.content && card.content !== "Generating response...") {
      await navigator.clipboard.writeText(card.content);
    }
  };

  const handleSources = () => {
    // Placeholder for sources functionality
  };

  const handleBranchCard = async (cardId: Id<"canvasCards">) => {
    const sourceCard = localCards.find(c => c._id === cardId);
    if (!sourceCard) return;

    try {
      // Create new card to the right of source card with some spacing
      const cardWidth = 400;
      const cardHeight = 300;
      const spacing = 150;
      const newCardX = sourceCard.x + sourceCard.width + spacing;
      const newCardY = sourceCard.y;

      // Generate temporary ID for instant local rendering
      const tempId = `temp-${Date.now()}` as Id<"canvasCards">;

      // Calculate branch number for new card (it will have 1 incoming connection)
      const branchNumber = 1;

      // INSTANTLY add to local state first (snappy UI) - copy content from source
      setLocalCards(prev => [...prev, {
        _id: tempId,
        x: newCardX,
        y: newCardY,
        width: cardWidth,
        height: cardHeight,
        content: sourceCard.content, // Copy content from source card
        branchNumber,
      }]);

      // Create in database in background
      const newCardId = await branchCard({
        sourceCardId: cardId,
        x: newCardX,
        y: newCardY,
      });

      // Replace temp ID with real ID in local cards
      setLocalCards(prev => prev.map(card =>
        card._id === tempId ? { ...card, _id: newCardId } : card
      ));

      // Create connection between cards
      await createConnection({
        canvasId,
        sourceCardId: cardId,
        targetCardId: newCardId,
      });
    } catch (error) {
      console.error('Branch creation error:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers for file attachments
  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }
  };

  // Canvas pan handlers
  const handleCanvasPanStart = (e: React.MouseEvent) => {
    console.log('Mouse position when clicked:', { x: e.clientX, y: e.clientY });

    // Only pan with left click
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;

    // Only start panning if clicking directly on the canvas area (not on cards or UI)
    const isCanvasArea = target.hasAttribute('data-canvas-area');

    if (isCanvasArea) {
      // Convert mouse position to canvas coordinates
      const canvasWidth = 10000;
      const canvasHeight = 10000;

      // Mouse position relative to canvas (accounting for zoom and pan)
      const canvasX = (e.clientX - (canvasOffset?.x || 0)) / canvasZoom;
      const canvasY = (e.clientY - (canvasOffset?.y || 0)) / canvasZoom;

      // Determine horizontal region (left, mid, right)
      let horizontalRegion = '';
      if (canvasX < canvasWidth / 3) {
        horizontalRegion = 'left';
      } else if (canvasX < (canvasWidth * 2) / 3) {
        horizontalRegion = 'mid';
      } else {
        horizontalRegion = 'right';
      }

      // Determine vertical region (top, mid, bottom)
      let verticalRegion = '';
      if (canvasY < canvasHeight / 3) {
        verticalRegion = 'top';
      } else if (canvasY < (canvasHeight * 2) / 3) {
        verticalRegion = 'mid';
      } else {
        verticalRegion = 'bottom';
      }

      console.log(`${verticalRegion} ${horizontalRegion} side: position ${Math.round(canvasX)}, ${Math.round(canvasY)}`);
      console.log('Mouse position:', { x: e.clientX, y: e.clientY });

      // Exit edit mode when clicking on canvas
      if (editingCardId) {
        setEditingCardId(null);
      }

      // Deselect any selected card when clicking on canvas
      setSelectedCardId(null);

      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      setPanStart({ x: e.clientX - (canvasOffset?.x || 0), y: e.clientY - (canvasOffset?.y || 0) });
    }
  };

  const handleCanvasPanMove = (e: MouseEvent) => {
    if (isPanning && canvasOffset) {
      const newX = e.clientX - panStart.x;
      const newY = e.clientY - panStart.y;

      // Use requestAnimationFrame for smooth 60fps panning
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          // Clamp offset to canvas bounds
          const clampedOffset = clampCanvasOffset(newX, newY, canvasZoom);
          setCanvasOffset(clampedOffset);
          rafIdRef.current = null;
        });
      }
    }
  };

  const handleCanvasPanEnd = () => {
    setIsPanning(false);
  };

  // Helper function to clamp canvas offset to valid bounds
  // This ensures we can't pan/zoom to view outside the 10000x10000px canvas
  const clampCanvasOffset = (offsetX: number, offsetY: number, zoom: number): { x: number; y: number } => {
    const viewportElement = document.querySelector('.relative.h-full.w-full.overflow-hidden');
    if (!viewportElement) {
      return { x: offsetX, y: offsetY };
    }

    const viewportRect = viewportElement.getBoundingClientRect();
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;

    // Canvas bounds in screen space after zoom
    const scaledCanvasWidth = CANVAS_WIDTH * zoom;
    const scaledCanvasHeight = CANVAS_HEIGHT * zoom;

    // The canvas top-left corner in screen space is at (offsetX, offsetY)
    // The canvas bottom-right corner in screen space is at (offsetX + scaledWidth, offsetY + scaledHeight)

    // We want to prevent panning beyond canvas edges
    // Max offset = 0 (canvas left/top edge at viewport left/top)
    // Min offset = viewportSize - scaledCanvasSize (canvas right/bottom edge at viewport right/bottom)

    let clampedX = offsetX;
    let clampedY = offsetY;

    // If canvas is wider than viewport, constrain horizontal panning
    if (scaledCanvasWidth > viewportWidth) {
      const minOffsetX = viewportWidth - scaledCanvasWidth; // Right edge limit
      const maxOffsetX = 0; // Left edge limit
      clampedX = Math.max(minOffsetX, Math.min(maxOffsetX, offsetX));
    } else {
      // Canvas smaller than viewport - center it
      clampedX = (viewportWidth - scaledCanvasWidth) / 2;
    }

    // If canvas is taller than viewport, constrain vertical panning
    if (scaledCanvasHeight > viewportHeight) {
      const minOffsetY = viewportHeight - scaledCanvasHeight; // Bottom edge limit
      const maxOffsetY = 0; // Top edge limit
      clampedY = Math.max(minOffsetY, Math.min(maxOffsetY, offsetY));
    } else {
      // Canvas smaller than viewport - center it
      clampedY = (viewportHeight - scaledCanvasHeight) / 2;
    }

    return { x: clampedX, y: clampedY };
  };

  // Canvas zoom handler - works with normal scroll/trackpad pinch
  const handleCanvasWheel = (e: React.WheelEvent) => {
    // Check for pinch-to-zoom gesture (ctrlKey is set for pinch on trackpad)
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      // Mouse position relative to viewport
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = -e.deltaY * 0.003;
      const newZoom = Math.min(Math.max(0.1, canvasZoom + delta), 3);

      // Find what point in canvas space is currently under the mouse cursor
      const canvasPointX = (mouseX - (canvasOffset?.x || 0)) / canvasZoom;
      const canvasPointY = (mouseY - (canvasOffset?.y || 0)) / canvasZoom;

      // After zoom, keep that same canvas point under the mouse cursor
      const newOffsetX = mouseX - (canvasPointX * newZoom);
      const newOffsetY = mouseY - (canvasPointY * newZoom);

      // Clamp offset to canvas bounds
      const clampedOffset = clampCanvasOffset(newOffsetX, newOffsetY, newZoom);

      setCanvasZoom(newZoom);
      setCanvasOffset(clampedOffset);
    }
  };

  const handleZoomIn = () => {
    const viewportElement = document.querySelector('.relative.h-full.w-full.overflow-hidden');
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
    // CENTER VIEW = center of viewport in screen space
    const viewportCenterX = rect.width / 2;
    const viewportCenterY = rect.height / 2;

    const newZoom = Math.min(canvasZoom + 0.05, 3);

    // Find what canvas point is currently at CENTER VIEW
    // Canvas point = (screen point - offset) / zoom
    const canvasPointX = (viewportCenterX - (canvasOffset?.x || 0)) / canvasZoom;
    const canvasPointY = (viewportCenterY - (canvasOffset?.y || 0)) / canvasZoom;

    // After zoom, keep that canvas point at CENTER VIEW
    // offset = screen point - (canvas point * new zoom)
    const newOffsetX = viewportCenterX - (canvasPointX * newZoom);
    const newOffsetY = viewportCenterY - (canvasPointY * newZoom);

    // Clamp to ensure we don't view outside canvas
    const clampedOffset = clampCanvasOffset(newOffsetX, newOffsetY, newZoom);

    setCanvasZoom(newZoom);
    setCanvasOffset(clampedOffset);
  };

  const handleZoomOut = () => {
    const viewportElement = document.querySelector('.relative.h-full.w-full.overflow-hidden');
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
    // CENTER VIEW = center of viewport in screen space
    const viewportCenterX = rect.width / 2;
    const viewportCenterY = rect.height / 2;

    const newZoom = Math.max(canvasZoom - 0.05, 0.1);

    // Find what canvas point is currently at CENTER VIEW
    // Canvas point = (screen point - offset) / zoom
    const canvasPointX = (viewportCenterX - (canvasOffset?.x || 0)) / canvasZoom;
    const canvasPointY = (viewportCenterY - (canvasOffset?.y || 0)) / canvasZoom;

    // After zoom, keep that canvas point at CENTER VIEW
    // offset = screen point - (canvas point * new zoom)
    const newOffsetX = viewportCenterX - (canvasPointX * newZoom);
    const newOffsetY = viewportCenterY - (canvasPointY * newZoom);

    // Clamp to ensure we don't view outside canvas
    const clampedOffset = clampCanvasOffset(newOffsetX, newOffsetY, newZoom);

    setCanvasZoom(newZoom);
    setCanvasOffset(clampedOffset);
  };

  const handleResetView = () => {
    // Reset zoom to 1x and center on canvas center (5000, 5000)
    const viewportElement = document.querySelector('.relative.h-full.w-full.overflow-hidden');
    if (!viewportElement) {
      setCanvasZoom(1);
      setCanvasOffset({ x: 0, y: 0 });
      return;
    }

    const rect = viewportElement.getBoundingClientRect();
    const viewportCenterX = rect.width / 2;
    const viewportCenterY = rect.height / 2;

    // Center canvas center at viewport center
    const resetOffsetX = viewportCenterX - CANVAS_CENTER_X;
    const resetOffsetY = viewportCenterY - CANVAS_CENTER_Y;

    setCanvasZoom(1);
    setCanvasOffset({ x: resetOffsetX, y: resetOffsetY });
  };

  // Manual save function
  const handleSaveCanvas = async () => {
    setIsSaving(true);

    try {
      // First, sync any pending content changes to localCards state
      cardContentMapRef.current.forEach((content, cardId) => {
        setLocalCards(prev => {
          const cardIndex = prev.findIndex(c => c._id === cardId);
          if (cardIndex === -1) return prev;
          const newCards = [...prev];
          newCards[cardIndex] = { ...newCards[cardIndex], content };
          return newCards;
        });
      });

      // Small delay to ensure state update completes
      await new Promise(resolve => setTimeout(resolve, 50));

      // Save all cards' positions and content to Convex
      const savePromises = localCards.map(async (card) => {
        // Get latest content from ref, fallback to state
        const latestContent = cardContentMapRef.current.get(card._id) ?? card.content;

        await updateCardPosition({
          id: card._id,
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height,
        });
        await updateCardContent({
          id: card._id,
          content: latestContent,
        });
      });

      await Promise.all(savePromises);

      // Clear the content map after successful save
      cardContentMapRef.current.clear();
      setHasUnsavedChanges(false);
    } catch (error) {
      // Error saving cards
      console.error('Error saving canvas:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Create card from highlight handler
  const handleCreateCardFromHighlight = async (content: string, sourceCardId: string) => {
    try {
      const sourceCard = localCards.find(c => c._id === sourceCardId);

      if (!sourceCard) {
        console.error('Source card not found!');
        return;
      }

      // Position new card to the right of the source card
      const newCardX = sourceCard.x + sourceCard.width + 100;
      const newCardY = sourceCard.y;

      const newCardId = await createCard({
        canvasId,
        x: newCardX,
        y: newCardY,
        width: 400,
        height: 500,
        content,
      });

      // Immediately add the new card to local state
      setLocalCards(prev => [
        ...prev,
        {
          _id: newCardId,
          x: newCardX,
          y: newCardY,
          width: 400,
          height: 500,
          content,
        }
      ]);

      // Create connection between source card and new card
      await createConnection({
        canvasId,
        sourceCardId: sourceCardId as Id<"canvasCards">,
        targetCardId: newCardId,
      });
    } catch (error) {
      console.error("Error creating card from highlight:", error);
    }
  };


  useEffect(() => {
    // Use passive event listeners for better scroll/drag performance
    const passiveOptions = { passive: true };

    if (resizingCard) {
      window.addEventListener('mousemove', handleResizeMove, passiveOptions as any);
      window.addEventListener('mouseup', handleResizeEnd);
    } else {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    }

    if (isPanning) {
      window.addEventListener('mousemove', handleCanvasPanMove, passiveOptions as any);
      window.addEventListener('mouseup', handleCanvasPanEnd);
    } else {
      window.removeEventListener('mousemove', handleCanvasPanMove);
      window.removeEventListener('mouseup', handleCanvasPanEnd);
    }

    if (draggedCard) {
      window.addEventListener('mousemove', handleCardMouseMove, passiveOptions as any);
      window.addEventListener('mouseup', handleCardMouseUp);
    } else {
      window.removeEventListener('mousemove', handleCardMouseMove);
      window.removeEventListener('mouseup', handleCardMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('mousemove', handleCanvasPanMove);
      window.removeEventListener('mouseup', handleCanvasPanEnd);
      window.removeEventListener('mousemove', handleCardMouseMove);
      window.removeEventListener('mouseup', handleCardMouseUp);
    };
  }, [resizingCard, isPanning, draggedCard]);

  // Store card content locally per card - only synced on manual save
  const cardContentMapRef = useRef<Map<string, string>>(new Map());

  // Memoized callback handlers for OptimizedCanvasCard
  const handleContentChange = useCallback((cardId: Id<"canvasCards">, content: string) => {
    // Store content in ref only (NO state update, NO re-render!)
    cardContentMapRef.current.set(cardId, content);

    // Mark as having unsaved changes (only if not already marked)
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  }, [hasUnsavedChanges]);

  const handleCardTextareaRef = useCallback((el: HTMLTextAreaElement | null, cardId: Id<"canvasCards">) => {
    if (el) {
      cardTextareaRefs.current.set(cardId, el);
    } else {
      cardTextareaRefs.current.delete(cardId);
    }
  }, []);

  const handleEscapePress = useCallback(() => {
    setEditingCardId(null);
  }, []);

  const handleCardMouseEnter = useCallback((cardId: Id<"canvasCards">) => {
    setHoveredCard(cardId);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    setHoveredCard(null);
  }, []);

  if (!canvas || canvasOffset === null) {
    return (
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - Stays active during loading */}
        <aside className={`transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
          <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'}`}>
            <Sidebar
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
              onToggleCollapse={toggleSidebar}
              isCollapsed={isSidebarCollapsed}
            />
          </div>
        </aside>

        {/* Canvas Loading Skeleton - Only right side */}
        <div className="relative h-screen flex-1 overflow-hidden bg-background">
          <CanvasSkeleton />
        </div>
      </div>
    );
  }

  const selectedCard = localCards.find(c => c._id === selectedCardId);

  return (
    <ProtectedLayout>
      <TooltipProvider delayDuration={1000}>
        <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className={`transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'}`}>
          <Sidebar
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewChat}
            onToggleCollapse={toggleSidebar}
            isCollapsed={isSidebarCollapsed}
          />
        </div>
      </aside>

      <div className="relative h-screen flex-1 overflow-hidden bg-background">
        {/* Dotted Grid Background - Optimized for performance */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            color: 'var(--foreground)',
            willChange: 'transform',
            contain: 'strict',
          }}
        />

        {/* Sidebar Toggle Button - Fixed position */}
        {isSidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute left-4 top-4 z-50 h-8 w-8 hover:bg-black/10 dark:hover:bg-white/5"
          >
            <PanelLeft className="h-5 w-5 text-foreground" />
          </Button>
        )}

        {/* Canvas Title - Fixed position above canvas */}
        <div className={`absolute top-6 z-40 ${isSidebarCollapsed ? 'left-16' : 'left-6'} transition-all`}>
          <h1 className="text-2xl font-semibold text-foreground">
            {canvas.title}
          </h1>
        </div>

        {/* Canvas Area */}
        <div
          ref={viewportRef}
          className="relative h-full w-full overflow-hidden"
          onWheel={handleCanvasWheel}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            cursor: isPanning ? 'grabbing' : 'grab',
            touchAction: 'none'
          }}
        >
          <div
            data-canvas-area
            onMouseDown={handleCanvasPanStart}
            onClick={() => {
              if (selectedCardId || editingCardId) {
                console.log('Canvas clicked - clearing selection');
                if (editingCardId) {
                  console.log('Exit edit mode');
                }
                setSelectedCardId(null);
                setEditingCardId(null);
              }
            }}
            style={{
              transform: `translate(${(canvasOffset?.x || 0)}px, ${(canvasOffset?.y || 0)}px) scale(${canvasZoom})`,
              transformOrigin: '0 0',
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              position: 'absolute',
              left: '0px',
              top: '0px'
            }}
          >
          {/* Cards - Optimized with viewport culling */}
          {visibleCards.map((card) => (
            <OptimizedCanvasCard
              key={card._id}
              card={card}
              selectedCardId={selectedCardId}
              editingCardId={editingCardId}
              draggedCard={draggedCard}
              hoveredCard={hoveredCard}
              isOnTop={topCardId === card._id}
              onMouseDown={handleCardMouseDown}
              onCardClick={(e) => e.stopPropagation()}
              onMouseEnter={handleCardMouseEnter}
              onMouseLeave={handleCardMouseLeave}
              onContentChange={handleContentChange}
              onEscapePress={handleEscapePress}
              onResizeStart={handleResizeStart}
              cardTextareaRef={handleCardTextareaRef}
              conversationContext={card.conversationHistory || []}
              model={selectedModel.value}
              onCreateCardFromHighlight={handleCreateCardFromHighlight}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSendMessage={handleSendMessage}
              isSendingMessage={isSendingMessage}
              cardTokenUsage={selectedCardId === card._id ? cardTokenUsage : null}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              modelOptions={MODEL_OPTIONS}
              onDeleteCard={handleDeleteCard}
              onCopyContent={handleCopyContent}
              onBranchCard={handleBranchCard}
              onSources={handleSources}
              chatInputRef={chatInputRef}
              onEditingChange={(cardId) => setEditingCardId(cardId)}
              attachedFiles={attachedFiles}
              onFileSelect={handleFileSelect}
              onRemoveFile={removeFile}
              fileInputRef={fileInputRef}
              isProcessingFiles={isProcessingFiles}
            />
          ))}

          {/* Connection Lines */}
          {connections && (
            <CanvasConnections
              connections={connections}
              cards={localCards}
              zoom={canvasZoom}
              offset={canvasOffset}
            />
          )}

          </div>

          {/* Save Button - Top Right */}
          <div className="absolute top-6 right-6 z-30">
            <Button
              variant={hasUnsavedChanges ? "default" : "outline"}
              size="default"
              onClick={handleSaveCanvas}
              disabled={isSaving || !hasUnsavedChanges}
              className={`h-10 px-4 shadow-lg ${hasUnsavedChanges ? 'animate-pulse' : ''}`}
              title={hasUnsavedChanges ? "Save changes (Ctrl+S)" : "No unsaved changes"}
            >
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-20 right-6 flex flex-col gap-2 z-30">
            {/* Add New Card Button */}
            <Button
              variant="outline"
              size="icon"
              draggable
              onDragStart={handleNewCardDragStart}
              onDragEnd={handleNewCardDragEnd}
              className="h-10 w-10 bg-card shadow-lg cursor-grab active:cursor-grabbing"
              title="Drag to create new card"
            >
              <SquarePlus className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              className="h-10 w-10 bg-card shadow-lg"
              title="Zoom in (Ctrl + Scroll)"
            >
              <span className="text-lg">+</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleResetView}
              className="h-10 w-10 bg-card shadow-lg text-xs"
              title="Reset view"
            >
              {Math.round(canvasZoom * 100)}%
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              className="h-10 w-10 bg-card shadow-lg"
              title="Zoom out (Ctrl + Scroll)"
            >
              <span className="text-lg">−</span>
            </Button>
          </div>
        </div>

        {/* Fixed Chatbox at Bottom - appears when a card is selected */}
        {selectedCardId && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center px-8 pb-6 pointer-events-none z-50">
            <div className="pointer-events-auto w-full max-w-2xl">
              <ChatBox
                value={chatInput}
                onChange={setChatInput}
                onSubmit={handleSendMessage}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelOptions={MODEL_OPTIONS}
                attachedFiles={attachedFiles}
                onFileSelect={handleFileSelect}
                onRemoveFile={removeFile}
                isProcessingFiles={isProcessingFiles}
                fileInputRef={fileInputRef}
                tokenCount={cardTokenUsage}
                useHighReasoning={useHighReasoning}
                onHighReasoningChange={setUseHighReasoning}
                onCreateTest={undefined}
                canCreateTest={false}
                fileTypeError={fileTypeError}
                onDragEnter={handleFileDragEnter}
                onDragLeave={handleFileDragLeave}
                onDragOver={handleFileDragOver}
                onDrop={handleFileDrop}
                isDraggingOver={isDraggingOver}
                isLoading={isSendingMessage}
                textareaRef={chatInputRef}
              />
            </div>
          </div>
        )}
      </div>
    </div>
      </TooltipProvider>
    </ProtectedLayout>
  );
}
