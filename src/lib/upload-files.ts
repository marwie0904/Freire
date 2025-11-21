import { Id } from "../../convex/_generated/dataModel";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB in bytes
export const MAX_ATTACHMENTS = 5; // Maximum number of attachments per query

const ALLOWED_FILE_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/m4a",
  "audio/webm",
];

export interface FileAttachment {
  storageId: Id<"_storage">;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface UploadResult {
  success: boolean;
  attachments?: FileAttachment[];
  error?: string;
}

export async function validateFile(file: File): Promise<{ valid: boolean; error?: string }> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds 15MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type not supported: ${file.name} (${file.type})`,
    };
  }

  return { valid: true };
}

export async function uploadFilesToConvex(
  files: File[],
  generateUploadUrl: () => Promise<string>
): Promise<UploadResult> {
  try {
    // Check max attachments limit
    if (files.length > MAX_ATTACHMENTS) {
      return {
        success: false,
        error: `Maximum ${MAX_ATTACHMENTS} attachments allowed per query`,
      };
    }

    const attachments: FileAttachment[] = [];

    for (const file of files) {
      // Validate file
      const validation = await validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Generate upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload file to Convex storage
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${file.name}`);
      }

      const { storageId } = await response.json();

      // Add to attachments array
      attachments.push({
        storageId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
    }

    return {
      success: true,
      attachments,
    };
  } catch (error) {
    console.error("Error uploading files:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload files",
    };
  }
}
