"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Timer, ChevronDown, ArrowUp, MoreVertical, Pin, ListChecks, Globe, SlidersHorizontal, Search } from "lucide-react";
import { Message } from "./message";
import { CreateTestModal } from "./tests/create-test-modal";
import { TestDisplayModal, Test } from "./tests/test-display-modal";
import { TestResultsModal } from "./tests/test-results-modal";
import { FileAttachmentCard } from "./file-attachment-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenProgressCircle } from "./token-progress-circle";
import { LoadingWithText } from "@/components/ui/loading-with-text";
import { CubeLoader } from "@/components/ui/cube-loader";
import { AnimatedTitle } from "@/components/ui/animated-title";
import { ChatBox } from "@/components/ui/chat-box";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { uploadFilesToConvex, FileAttachment } from "@/lib/upload-files";
import { MODEL_OPTIONS } from "@/lib/models";
import { toast } from "sonner";
import { useFileValidation } from "@/hooks/use-file-validation";

// Global map to track active streams across all conversation instances
const activeStreams = new Map<string, {
  assistantMessageId: string;
  currentContent: string;
  isLoading: boolean;
  isStreaming: boolean;
}>();

interface ChatAreaProps {
  conversationId: Id<"conversations"> | null;
  isSidebarCollapsed?: boolean;
  onStreamingChange?: (isStreaming: boolean) => void;
}

export function ChatArea({ conversationId, isSidebarCollapsed = false, onStreamingChange }: ChatAreaProps) {
  const convex = useConvex();
  const { fileTypeError, validateFiles } = useFileValidation();
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [input, setInput] = useState("");
  const [isCreateTestOpen, setIsCreateTestOpen] = useState(false);
  const [isTestDisplayOpen, setIsTestDisplayOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [currentTest, setCurrentTest] = useState<Test | null>(null);
  const [testResult, setTestResult] = useState<{
    score: number;
    totalQuestions: number;
    answers: Record<string, string | string[]>;
  } | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [useHighReasoning, setUseHighReasoning] = useState(false);
  const [useResearchMode, setUseResearchMode] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load conversation data from Convex
  const conversation = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : "skip"
  );

  // Load conversation history from Convex
  const convexMessages = useQuery(
    api.messages.getAll,
    conversationId ? { conversationId } : "skip"
  );

  // Check token limit for current conversation
  const tokenCount = useQuery(
    api.messages.getOutputTokenCount,
    conversationId ? { conversationId } : "skip"
  );

  // Mutations for conversation actions
  const togglePin = useMutation(api.conversations.togglePin);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const deleteConversation = useMutation(api.conversations.remove);

  // Mutation for submitting test responses
  const submitTestResponse = useMutation(api.testResponses.submit);

  // Mutation for file uploads
  const generateUploadUrl = useMutation(api.messageFiles.generateUploadUrl);

  // Mutation for saving assistant messages after streaming
  const saveMessage = useMutation(api.messages.create);

  // Manual message state management
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Track which conversation is currently streaming to prevent message leakage
  const streamingConversationRef = useRef<Id<"conversations"> | null>(null);

  // Reset or restore streaming state when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setIsLoading(false);
      setIsStreaming(false);
      streamingConversationRef.current = null;
      return;
    }

    // Check if this conversation has an active stream
    const activeStream = activeStreams.get(conversationId);

    if (activeStream) {
      // Restore streaming state
      console.log(`🔄 [Stream] Restoring active stream for conversation ${conversationId}`);
      setIsLoading(activeStream.isLoading);
      setIsStreaming(activeStream.isStreaming);
      streamingConversationRef.current = conversationId;
    } else {
      // Reset streaming state
      setIsLoading(false);
      setIsStreaming(false);
      streamingConversationRef.current = null;
    }
  }, [conversationId]);

  // Notify parent when streaming state changes
  useEffect(() => {
    if (onStreamingChange) {
      onStreamingChange(isLoading || isStreaming);
    }
  }, [isLoading, isStreaming, onStreamingChange]);

  // Monitor active streams and update UI when viewing a streaming conversation
  useEffect(() => {
    if (!conversationId || !isStreaming) return;

    const interval = setInterval(() => {
      const activeStream = activeStreams.get(conversationId);

      if (activeStream && activeStream.currentContent) {
        // Update the streaming message with the latest content
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];

          // Only update if the last message is the streaming message
          if (lastMessage && lastMessage.id === activeStream.assistantMessageId) {
            return prev.map(m =>
              m.id === activeStream.assistantMessageId
                ? { ...m, content: activeStream.currentContent }
                : m
            );
          }

          return prev;
        });
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [conversationId, isStreaming]);

  // Manual sendMessage function with stream reading
  const sendMessage = async (userMessage: { role: string; content: string }, options: any) => {
    const targetConversationId = options.body.conversationId;

    // Track which conversation we're streaming to
    streamingConversationRef.current = targetConversationId;

    // isLoading is already set to true by onSubmit
    setIsStreaming(false);

    // Create placeholder for assistant with unique ID
    const assistantId = `assistant-${Date.now()}`;
    let assistantMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    // Register this stream in the global map
    activeStreams.set(targetConversationId, {
      assistantMessageId: assistantId,
      currentContent: '',
      isLoading: true,
      isStreaming: false,
    });

    try {
      // Build the user message for the API request
      const userMsgForApi = {
        role: userMessage.role,
        content: userMessage.content,
      };

      // Fetch from /api/chat-v2
      const response = await fetch('/api/chat-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsgForApi].map(m => ({ role: m.role, content: m.content })),
          model: options.body.model,
          conversationId: options.body.conversationId,
          attachments: options.body.attachments,
          useHighReasoning,
        }),
      });

      // Read stream manually
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let fullText = '';
      let frontendChunkCount = 0;
      let metadata: any = null;

      console.log('🔵 [Frontend] Starting to read from API stream...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('🏁 [Frontend] Stream reader done signal received');
          break;
        }

        console.log(`🔵 [Frontend] Received data from API`);
        const chunk = decoder.decode(value, { stream: true });

        // Parse AI SDK stream format: 0:"text", d:{metadata}, e:{error/retry}
        const lines = chunk.split('\n').filter(line => line.trim());
        console.log(`🔵 [Frontend] Decoded ${lines.length} lines from chunk`);

        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              frontendChunkCount++;
              const text = JSON.parse(line.substring(2));
              fullText += text;

              console.log(`🟢 [Frontend] Content chunk #${frontendChunkCount} received, updating UI`);

              // Clear error state on successful content
              if (hasError && streamingConversationRef.current === targetConversationId) {
                setHasError(false);
                setRetryAttempt(0);
              }

              // Update global stream state
              const streamState = activeStreams.get(targetConversationId);
              if (streamState) {
                streamState.currentContent = fullText;
                streamState.isStreaming = true;
                streamState.isLoading = false;
              }

              // Mark as streaming once we receive first content chunk
              if (!isStreaming && streamingConversationRef.current === targetConversationId) {
                console.log('🔵 [Frontend] Setting isStreaming to true');
                setIsStreaming(true);
              }

              // Update UI immediately after each text chunk - only update content
              if (streamingConversationRef.current === targetConversationId) {
                console.log(`🔵 [Frontend] Calling setMessages for chunk #${frontendChunkCount}`);
                setMessages(prev =>
                  prev.map(m => (m.id === assistantId ? { ...m, content: fullText } : m))
                );
                console.log(`✅ [Frontend] UI updated with chunk #${frontendChunkCount}`);
              }
            } catch (e) {
              console.warn('Failed to parse chunk:', line);
            }
          } else if (line.startsWith('e:')) {
            // Handle error/retry status
            try {
              const errorData = JSON.parse(line.substring(2));
              console.log('⚠️ [Stream] Received error/retry:', errorData);

              if (streamingConversationRef.current === targetConversationId) {
                if (errorData.type === 'error') {
                  setHasError(true);
                  setRetryAttempt(errorData.attempt || 0);
                } else if (errorData.type === 'retry') {
                  setHasError(false);
                  setRetryAttempt(errorData.attempt || 0);
                }
              }
            } catch (e) {
              console.warn('Failed to parse error data:', line);
            }
          } else if (line.startsWith('d:')) {
            // Handle metadata (usage, search sources, etc.)
            try {
              metadata = JSON.parse(line.substring(2));
              console.log('📊 [Stream] Received metadata:', metadata);
            } catch (e) {
              console.warn('Failed to parse metadata:', line);
            }
          } else if (line.startsWith('data:')) {
            // Handle SSE format (for backwards compatibility)
            const data = line.substring(5).trim();
            if (data !== '[DONE]') {
              fullText += data;
            }
          }
        }
      }

      console.log(`🏁 [Frontend] Stream reading complete - Total content chunks: ${frontendChunkCount}`);

      // NOTE: Message saving now happens on the backend (API route) instead of frontend
      // This ensures the message is saved before title generation is triggered
      console.log('ℹ️ [Stream] Message already saved by backend API route');
    } catch (error) {
      console.error('Streaming error:', error);

      // Set final error state if max retries exceeded
      if (streamingConversationRef.current === targetConversationId) {
        setHasError(true);
      }
    } finally {
      console.log(`🔴 [Frontend] Finally block - cleaning up stream`);

      // Clean up global stream state
      activeStreams.delete(targetConversationId);
      console.log(`🔴 [Frontend] Deleted activeStream for conversation ${targetConversationId}`);

      // Only clear streaming state if we're still on the same conversation
      if (streamingConversationRef.current === targetConversationId) {
        console.log('🔴 [Frontend] Stream ended, clearing loading/streaming state');
        console.log(`🔴 [Frontend] Setting isLoading: true -> false`);
        setIsLoading(false);
        console.log(`🔴 [Frontend] Setting isStreaming: true -> false`);
        setIsStreaming(false);
        console.log(`🔴 [Frontend] All state cleared`);
        // Reset error states
        setHasError(false);
        setRetryAttempt(0);
      }
    }
  };

  // Load saved model from localStorage on mount (client-side only)
  useEffect(() => {
    const savedModelValue = localStorage.getItem('selectedModel');
    if (savedModelValue) {
      const savedModel = MODEL_OPTIONS.find(m => m.value === savedModelValue);
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    }
  }, []);

  // Save selected model to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel.value);
  }, [selectedModel]);

  // Load conversation history when conversationId changes
  useEffect(() => {
    console.log(`🟡 [Messages Effect] Running - conversationId: ${conversationId}, isLoading: ${isLoading}, isStreaming: ${isStreaming}`);

    if (!conversationId) {
      console.log(`🟡 [Messages Effect] No conversationId, clearing messages`);
      setMessages([]);
      return;
    }

    // Check if there's an active stream for this conversation
    const activeStream = activeStreams.get(conversationId);
    console.log(`🟡 [Messages Effect] Active stream exists: ${!!activeStream}`);

    if (activeStream) {
      // Restore the streaming message along with conversation history
      if (convexMessages) {
        const formattedMessages = convexMessages.map((msg) => ({
          id: msg._id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          createdAt: new Date(msg.createdAt),
          attachments: msg.attachments,
          searchMetadata: msg.searchMetadata,
          tokenUsage: msg.tokenUsage,
          reasoningDetails: msg.reasoningDetails,
        }));

        // Add the streaming message at the end
        const streamingMessage = {
          id: activeStream.assistantMessageId,
          role: 'assistant' as const,
          content: activeStream.currentContent,
          createdAt: new Date(),
        };

        setMessages([...formattedMessages, streamingMessage]);
        console.log(`🔄 [Stream] Restored streaming message with ${activeStream.currentContent.length} characters`);
      }
    } else {
      // No active stream - load messages from Convex
      if (convexMessages) {
        const formattedMessages = convexMessages.map((msg) => ({
          id: msg._id,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
          createdAt: new Date(msg.createdAt),
          attachments: msg.attachments,
          searchMetadata: msg.searchMetadata,
          tokenUsage: msg.tokenUsage,
          reasoningDetails: msg.reasoningDetails,
        }));

        // Only update if messages actually changed to prevent unnecessary re-renders
        setMessages(prev => {
          // If we're currently loading/streaming, preserve any optimistic messages at the end
          if (isLoading || isStreaming) {
            // Find optimistic messages (user/assistant prefixed IDs, not Convex IDs which start with 'j')
            const optimisticMessages = prev.filter(m =>
              typeof m.id === 'string' && (m.id.startsWith('user-') || m.id.startsWith('assistant-'))
            );

            // If we have optimistic messages, append them to Convex messages
            if (optimisticMessages.length > 0) {
              console.log('🔄 [Messages] Preserving optimistic messages:', optimisticMessages.length);
              return [...formattedMessages, ...optimisticMessages];
            }
          }

          // Check if content actually changed to prevent re-render flash
          if (prev.length === formattedMessages.length) {
            const lastPrev = prev[prev.length - 1];
            const lastFormatted = formattedMessages[formattedMessages.length - 1];

            console.log(`🟡 [Messages Effect] Comparing last messages - prev length: ${lastPrev?.content?.length || 0}, formatted length: ${lastFormatted?.content?.length || 0}`);

            // If the last message content is the same, don't update
            if (lastPrev && lastFormatted && lastPrev.content === lastFormatted.content) {
              console.log('🟢 [Messages Effect] Content unchanged, skipping update to prevent flash');
              return prev;
            }
          }

          console.log(`🟡 [Messages Effect] Updating messages - count: ${formattedMessages.length}`);
          return formattedMessages;
        });
      }
    }
  }, [convexMessages, conversationId]); // Removed isLoading, isStreaming to prevent re-run when stream ends

  // Track if user has scrolled up manually
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect when user manually scrolls
  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const isAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;

      // If user scrolls up, disable auto-scroll
      if (!isAtBottom) {
        setIsUserScrolling(true);

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      } else {
        // User scrolled back to bottom, re-enable auto-scroll
        setIsUserScrolling(false);
      }
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new messages arrive (only if user hasn't scrolled up)
  useEffect(() => {
    if (isUserScrolling) return; // Don't auto-scroll if user is reading

    if (scrollViewportRef.current) {
      const viewport = scrollViewportRef.current;

      // Use smooth scroll during streaming, instant when not streaming
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: isStreaming ? "smooth" : "auto"
      });
    }
  }, [messages, isUserScrolling, isStreaming]);

  // Auto-resize textarea based on content - debounced to reduce layout calculations
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Use requestAnimationFrame to batch DOM reads/writes
    const rafId = requestAnimationFrame(() => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    });

    return () => cancelAnimationFrame(rafId);
  }, [input]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const filesArray = Array.from(files);
      const validFiles = validateFiles(filesArray);

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles]);
      }
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [validateFiles]);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're leaving the drop zone entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const filesArray = Array.from(files);
      const validFiles = validateFiles(filesArray);

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles]);
      }
    }
  }, [validateFiles]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || !conversationId) return;

    // Capture the message content and files before clearing
    const messageContent = input || "Analyze these files";
    const messagesToUpload = [...attachedFiles];

    // Create user message immediately with unique ID
    const timestamp = Date.now();
    const userMsg = {
      id: `user-${timestamp}`,
      role: 'user' as const,
      content: messageContent,
      createdAt: new Date(timestamp),
      attachments: undefined as any, // Will be updated after upload
    };

    // Force immediate render using flushSync
    flushSync(() => {
      setIsLoading(true);
      setMessages(prev => [...prev, userMsg]);
      setInput("");
      setAttachedFiles([]);
    });

    try {
      let fileAttachments: FileAttachment[] | undefined = undefined;

      // Upload files if any are attached
      if (messagesToUpload.length > 0) {
        setIsProcessingFiles(true);
        const uploadResult = await uploadFilesToConvex(messagesToUpload, generateUploadUrl);

        if (!uploadResult.success) {
          alert(uploadResult.error || "Failed to upload files");
          // Remove the optimistic user message
          setMessages(prev => prev.filter(m => m.id !== userMsg.id));
          return;
        }

        fileAttachments = uploadResult.attachments;

        // Update the user message with attachments
        setMessages(prev => prev.map(m =>
          m.id === userMsg.id
            ? { ...m, attachments: fileAttachments }
            : m
        ));
      }

      // Send message with attachments
      sendMessage(
        {
          role: "user",
          content: messageContent,
        },
        {
          body: {
            model: selectedModel.value,
            conversationId,
            attachments: fileAttachments,
          },
        }
      );
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message");
      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleRename = useCallback(() => {
    if (!conversationId) return;
    const newTitle = prompt("Enter new conversation title:", conversation?.title || "");
    if (newTitle && newTitle.trim()) {
      updateTitle({ conversationId, title: newTitle.trim() });
    }
  }, [conversationId, conversation?.title, updateTitle]);

  const handleDelete = useCallback(() => {
    if (!conversationId) return;
    if (confirm("Are you sure you want to delete this conversation?")) {
      deleteConversation({ conversationId });
    }
  }, [conversationId, deleteConversation]);

  const handleTogglePin = useCallback(() => {
    if (!conversationId) return;
    togglePin({ conversationId });
  }, [conversationId, togglePin]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Trigger form submit
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  }, []);

  const handleTestCreated = (testData: any) => {
    // Test is now being generated in background
    console.log("Test created:", testData);

    // Don't open the test display modal if the test is generating
    // User can view it from the tests page once it's ready
    if (testData.isGenerating) {
      toast.success("Test is generating! Check the Tests page to view it when ready.", {
        duration: 5000,
      });
      return;
    }

    // For old tests that were generated synchronously
    const testWithId = {
      ...testData.test,
      _id: testData.testId,
    };
    setCurrentTest(testWithId);
    setIsTestDisplayOpen(true);
  };

  const handleTestSubmit = async (answers: Record<string, string | string[]>) => {
    if (!currentTest || !currentTest._id || !conversationId) return;

    try {
      // Submit the test response and get the score
      const result = await submitTestResponse({
        testId: currentTest._id as Id<"tests">,
        conversationId,
        answers: JSON.stringify(answers),
      });

      console.log("Test submitted successfully:", result);

      // Store the result and show the results modal
      setTestResult({
        score: result.score,
        totalQuestions: result.totalQuestions,
        answers,
      });

      // Close test display and open results
      setIsTestDisplayOpen(false);
      setIsResultsOpen(true);
    } catch (error) {
      console.error("Failed to submit test:", error);
    }
  };

  const handleRetakeTest = () => {
    // Reopen the test display modal
    setIsResultsOpen(false);
    setTestResult(null);
    setIsTestDisplayOpen(true);
  };

  // Check if we're in loading state
  const isConversationLoading = conversationId && conversation === undefined;

  return (
    <TooltipProvider delayDuration={1000}>
      <div className="relative flex h-full flex-col bg-background overflow-hidden">
      {/* Header */}
      {conversationId && (
        <div className={`flex items-center justify-between pt-4 pb-4 border-b border-border/40 flex-shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'pl-16 pr-8' : 'px-8'}`}>
          {isConversationLoading ? (
            <>
              <Skeleton className="h-7 w-48" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </>
          ) : conversation ? (
            <>
              <AnimatedTitle
                title={conversation.title || "New Conversation"}
                className="text-xl font-normal truncate max-w-md"
                shouldAnimate={conversation.isTitleAutoGenerated ?? false}
              />
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleRename}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleTogglePin}
                >
                  <Pin className={`h-5 w-5 ${conversation.isPinned ? 'fill-current' : ''}`} />
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
        <div className="mx-auto max-w-2xl space-y-6 px-8 py-8 pb-48">
          {isConversationLoading ? (
            // Show skeleton while loading
            [1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground">
              <p>Start a conversation...</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <Message
                  key={msg.id}
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  parts={msg.parts}
                  conversationContext={messages}
                  conversationId={conversationId || undefined}
                  model={selectedModel.value}
                  isStreaming={isStreaming && index === messages.length - 1}
                  attachments={(msg as any).attachments}
                  searchMetadata={(msg as any).searchMetadata}
                  tokenUsage={(msg as any).tokenUsage}
                  reasoningDetails={(msg as any).reasoningDetails}
                />
              ))}
            </>
          )}
          {isLoading && !isStreaming && (
            <>
              {hasError && retryAttempt > 0 && retryAttempt < 3 ? (
                <LoadingWithText
                  size="sm"
                  speed="fast"
                  variant="error"
                  customText={`Freire is Experiencing Errors, Retrying [${retryAttempt}]`}
                />
              ) : hasError && retryAttempt >= 3 ? (
                <div className="text-red-600 dark:text-red-500 text-sm font-medium">
                  Error: could not connect to providers
                </div>
              ) : (
                <LoadingWithText size="sm" speed="fast" />
              )}
            </>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Floating Input Area */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center px-8 pb-6">
        <div className="pointer-events-auto w-full max-w-2xl flex flex-col gap-2">
          {/* Token Limit Warning Banner */}
          {tokenCount?.isLimitReached && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-medium text-amber-600 dark:text-amber-500">
                  Token limit reached
                </span>
              </div>
              <p className="text-amber-600/90 dark:text-amber-500/90 mt-1 text-xs">
                This conversation has used {tokenCount.totalOutputTokens.toLocaleString()} output tokens (limit: {tokenCount.limit.toLocaleString()}).
                Please start a new conversation to continue.
              </p>
            </div>
          )}

          <ChatBox
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            modelOptions={MODEL_OPTIONS}
            attachedFiles={attachedFiles}
            onFileSelect={handleFileSelect}
            onRemoveFile={removeFile}
            isProcessingFiles={isProcessingFiles}
            fileInputRef={fileInputRef}
            tokenCount={tokenCount}
            useHighReasoning={useHighReasoning}
            onHighReasoningChange={setUseHighReasoning}
            onCreateTest={() => setIsCreateTestOpen(true)}
            canCreateTest={!!conversationId && messages.length > 0}
            fileTypeError={fileTypeError}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isDraggingOver={isDraggingOver}
            isLoading={isLoading}
            textareaRef={textareaRef}
          />
        </div>
      </div>

      {/* Create Test Modal */}
      <CreateTestModal
        open={isCreateTestOpen}
        onOpenChange={setIsCreateTestOpen}
        conversationId={conversationId}
        onTestCreated={handleTestCreated}
      />

      {/* Test Display Modal */}
      <TestDisplayModal
        open={isTestDisplayOpen}
        onOpenChange={setIsTestDisplayOpen}
        test={currentTest}
        onSubmit={handleTestSubmit}
      />

      {/* Test Results Modal */}
      <TestResultsModal
        open={isResultsOpen}
        onOpenChange={setIsResultsOpen}
        test={currentTest}
        result={testResult}
        onRetake={handleRetakeTest}
        conversationContext={messages}
        model={selectedModel.value}
      />
      </div>
    </TooltipProvider>
  );
}
