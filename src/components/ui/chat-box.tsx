"use client";

import { useRef, useState, FormEvent, ChangeEvent, KeyboardEvent, DragEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, ArrowUp, Timer, ListChecks, ChevronDown, SlidersHorizontal, Search } from "lucide-react";
import { FileAttachmentCard } from "@/components/file-attachment-card";

interface ModelOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
  tooltip?: string;
}

interface ChatBoxProps {
  // Input props
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder?: string;
  disabled?: boolean;

  // Model selection
  selectedModel: ModelOption;
  onModelChange: (model: ModelOption) => void;
  modelOptions: ModelOption[];

  // File attachments
  attachedFiles?: File[];
  onFileSelect?: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile?: (index: number) => void;
  isProcessingFiles?: boolean;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;

  // Token tracking
  tokenCount?: {
    totalOutputTokens: number;
    limit: number;
    isLimitReached: boolean;
  } | null;

  // Features
  useHighReasoning?: boolean;
  onHighReasoningChange?: (value: boolean) => void;
  onCreateTest?: () => void;
  canCreateTest?: boolean;

  // File type error
  fileTypeError?: string | null;

  // Drag and drop
  onDragEnter?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  isDraggingOver?: boolean;

  // Loading state
  isLoading?: boolean;

  // Ref for textarea
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatBox({
  value,
  onChange,
  onSubmit,
  placeholder = "How can I help you today?",
  disabled = false,
  selectedModel,
  onModelChange,
  modelOptions,
  attachedFiles = [],
  onFileSelect,
  onRemoveFile,
  isProcessingFiles = false,
  fileInputRef: externalFileInputRef,
  tokenCount,
  useHighReasoning = false,
  onHighReasoningChange,
  onCreateTest,
  canCreateTest = false,
  fileTypeError,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  isDraggingOver = false,
  isLoading = false,
  textareaRef: externalTextareaRef,
}: ChatBoxProps) {
  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);

  const fileInputRef = externalFileInputRef || internalFileInputRef;
  const textareaRef = externalTextareaRef || internalTextareaRef;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col relative">
      {/* File Type Error - Popup above chatbox */}
      {fileTypeError && (
        <div className="absolute bottom-full left-0 right-0 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs shadow-lg">
            {fileTypeError}
          </div>
        </div>
      )}

      {/* Main Input Container */}
      <div
        className="relative flex flex-col-reverse rounded-2xl shadow-lg bg-chat-input"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Toolbar - Bottom in visual, first in flex-col-reverse */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            {/* File Upload Button */}
            {onFileSelect && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-border/40 hover:border-border hover:bg-accent/5"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingFiles}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add files</p>
                  </TooltipContent>
                </Tooltip>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.webm,.doc,.docx,.txt"
                  onChange={onFileSelect}
                  className="hidden"
                />
              </>
            )}

            {/* Settings Dropdown */}
            {(onHighReasoningChange || onCreateTest) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md border border-border/40 hover:border-border hover:bg-accent/5"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <TooltipProvider>
                    {onHighReasoningChange && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() => onHighReasoningChange(!useHighReasoning)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Timer className="h-4 w-4" />
                              <span>Extended Thinking</span>
                            </div>
                            <div className={`h-4 w-8 rounded-full transition-colors ${useHighReasoning ? 'bg-primary' : 'bg-muted'} relative`}>
                              <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${useHighReasoning ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          Increases web searches and enables deeper reasoning. <strong>Consumes more usage.</strong>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          disabled
                          className="flex items-center justify-between cursor-not-allowed opacity-50"
                        >
                          <div className="flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            <span>Research Mode</span>
                          </div>
                          <div className={`h-4 w-8 rounded-full transition-colors bg-muted relative`}>
                            <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform translate-x-0.5`} />
                          </div>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        Conducts comprehensive research with 5 web searches and detailed analysis. <strong>Consumes significantly more usage</strong> due to extensive context and reasoning.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {onCreateTest && (
                    <DropdownMenuItem
                      onClick={onCreateTest}
                      disabled={!canCreateTest}
                      className="flex items-center gap-2"
                    >
                      <ListChecks className="h-4 w-4" />
                      <span>Create Test</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Model Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-3 text-xs font-medium rounded-md border border-border/40 hover:border-border hover:bg-accent/5"
                >
                  {selectedModel.label}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <TooltipProvider>
                  {modelOptions.map((model, index) => {
                    const menuItem = (
                      <DropdownMenuItem
                        key={`${model.value}-${index}`}
                        onClick={() => !model.disabled && onModelChange(model)}
                        disabled={model.disabled}
                        className={model.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{model.label}</span>
                          {model.description && (
                            <span className="text-xs text-muted-foreground">
                              {model.description}
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    );

                    if (model.tooltip) {
                      return (
                        <Tooltip key={`${model.value}-${index}`}>
                          <TooltipTrigger asChild>
                            {menuItem}
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs whitespace-pre-line">
                            {model.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return menuItem;
                  })}
                </TooltipProvider>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Submit Button */}
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || isProcessingFiles || (!value.trim() && attachedFiles.length === 0) || tokenCount?.isLimitReached}
              className="h-8 w-8 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50"
              title={tokenCount?.isLimitReached ? "Token limit reached" : undefined}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Textarea - Second in flex-col-reverse so it appears on top */}
        <Textarea
          ref={textareaRef}
          placeholder={tokenCount?.isLimitReached ? "Token limit reached - start a new conversation" : placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled || isLoading || tokenCount?.isLimitReached}
          className="min-h-[24px] max-h-[300px] resize-none border-0 bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden placeholder:text-muted-foreground/50"
          style={{ pointerEvents: 'auto' }}
        />

        {/* Drag and Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Plus className="h-8 w-8" />
              <p className="text-sm font-medium">Drop files</p>
            </div>
          </div>
        )}
      </div>

      {/* File Attachments Container - Below Input Box */}
      {onRemoveFile && (attachedFiles.length > 0 || isProcessingFiles) && (
        <div className="relative rounded-b-2xl border-x border-b shadow-lg bg-chat-input">
          {/* Background extension behind input box */}
          <div className="absolute bottom-full -left-px -right-px h-12 -z-10 border-x border-border bg-chat-input"></div>

          <div className="flex flex-wrap gap-2 p-3">
            {attachedFiles.map((file, index) => (
              <FileAttachmentCard
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => onRemoveFile(index)}
              />
            ))}
            {isProcessingFiles && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                Uploading files...
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
