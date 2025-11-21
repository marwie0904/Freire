"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Upload, FileText, Image, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFileValidation } from "@/hooks/use-file-validation";

interface CreateTestFromDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestCreated: (testId: string) => void;
}

type TestFormat = "multiple_choice" | "flashcard";

const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/jpg": [".jpg"], // Add explicit jpg MIME type
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "audio/mpeg": [".mp3"],
  "audio/mp3": [".mp3"], // Add explicit mp3 MIME type
  "audio/wav": [".wav"],
  "audio/m4a": [".m4a"],
  "audio/webm": [".webm"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (higher limit for test generation)
const MAX_FILES = 10; // Maximum 10 files for test generation

export function CreateTestFromDocumentModal({
  isOpen,
  onClose,
  onTestCreated,
}: CreateTestFromDocumentModalProps) {
  const authToken = useAuthToken();
  const { fileTypeError, validateFiles } = useFileValidation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [testFormat, setTestFormat] = useState<TestFormat>("multiple_choice");
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);

    // Combine all files for validation
    const allFiles = [
      ...acceptedFiles,
      ...rejectedFiles.map((r) => r.file),
    ];

    if (allFiles.length === 0) return;

    // Check if adding files would exceed the limit
    if (selectedFiles.length + allFiles.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed for test generation`);
      return;
    }

    // Validate file types and sizes (hook handles both)
    const validFiles = validateFiles(allFiles);

    if (validFiles.length === 0) {
      // validateFiles already set the error message (type or size)
      return;
    }

    // All validations passed
    setSelectedFiles((prev) => [...prev, ...validFiles]);
  }, [validateFiles, selectedFiles.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    noClick: false,
    noKeyboard: false,
    validator: undefined, // Disable built-in validation, we handle it in onDrop
  });

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleGenerateTest = async () => {
    if (selectedFiles.length === 0) {
      setError("Please upload at least one file");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });
      formData.append("testFormat", testFormat);
      formData.append("questionCount", questionCount.toString());

      const response = await fetch("/api/generate-test-from-document", {
        method: "POST",
        headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate test");
      }

      const data = await response.json();
      // Test is now generating in background
      onTestCreated(data.testId);

      // Reset and close immediately
      setSelectedFiles([]);
      setTestFormat("multiple_choice");
      setQuestionCount(10);
      setError(null);
      setIsGenerating(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate test");
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setSelectedFiles([]);
      setTestFormat("multiple_choice");
      setQuestionCount(10);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Test from Documents</DialogTitle>
          <DialogDescription>
            Upload PDF, DOCX, or image files to generate a test
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Upload Area */}
          <div>
            <Label className="mb-2 block">Upload Files</Label>
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-foreground mb-1">
                {isDragActive
                  ? "Drop files here..."
                  : "Drag & drop files here, or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports PDF, Images (PNG, JPG, WEBP, GIF), Audio (MP3, WAV, M4A) - max 50MB each, up to 10 files
              </p>
            </div>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Files ({selectedFiles.length})</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getFileIcon(file)}
                      <span className="text-sm truncate">{file.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {formatFileSize(file.size)}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => removeFile(index)}
                      disabled={isGenerating}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Format Selection */}
          <div className="space-y-3">
            <Label>Test Format</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTestFormat("multiple_choice")}
                disabled={isGenerating}
                className={`
                  p-4 rounded-lg border-2 transition-all text-left
                  ${testFormat === "multiple_choice"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                  }
                  ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                <div className="font-medium mb-1">Multiple Choice</div>
                <div className="text-xs text-muted-foreground">
                  4 options per question
                </div>
              </button>
              <button
                onClick={() => setTestFormat("flashcard")}
                disabled={isGenerating}
                className={`
                  p-4 rounded-lg border-2 transition-all text-left
                  ${testFormat === "flashcard"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                  }
                  ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                <div className="font-medium mb-1">Flashcard</div>
                <div className="text-xs text-muted-foreground">
                  Front and back cards
                </div>
              </button>
            </div>
          </div>

          {/* Question Count */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Number of Questions</Label>
              <span className="text-sm font-medium">{questionCount}</span>
            </div>
            <Slider
              value={[questionCount]}
              onValueChange={(values) => setQuestionCount(values[0])}
              min={5}
              max={50}
              step={5}
              disabled={isGenerating}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5</span>
              <span>50</span>
            </div>
          </div>

          {/* Error Messages */}
          {(error || fileTypeError) && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {fileTypeError || error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateTest}
              disabled={isGenerating || selectedFiles.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Test"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
