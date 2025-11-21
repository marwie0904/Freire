"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const DOCUMENT_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/webm"];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function getPromptTemplate(fileType: string, userPrompt: string): string {
  if (DOCUMENT_TYPES.includes(fileType)) {
    return `User request: "${userPrompt}"

DO NOT ANSWER THE USER'S REQUEST. Your task is only to extract and provide context from this document.

Extract all text from this document with the following requirements:
- Prioritize information most relevant to the user's request
- Include page numbers for each section
- Preserve document structure and formatting context
- For images, charts, diagrams, or non-text elements: provide detailed descriptions that would allow a blind person to understand the visual content when read aloud, focusing on elements relevant to the user's request
- Maintain reading flow and logical organization
- Simply provide the extracted content with context - do not interpret, answer, or solve the user's request`;
  }

  if (AUDIO_TYPES.includes(fileType)) {
    return `User request: "${userPrompt}"

DO NOT ANSWER THE USER'S REQUEST. Your task is only to transcribe and provide context from this audio.

Transcribe this audio file with the following requirements:
- Prioritize sections most relevant to the user's request
- Provide accurate transcription of all spoken words
- Include speaker changes if multiple speakers are present
- For non-speech sounds (music, ambient noise, sound effects, etc.): describe them in [brackets] with sufficient context so a deaf person can understand the audio's full content
- Include timing context where relevant (pauses, interruptions, overlapping speech)
- Simply provide the transcription with context - do not interpret, answer, or solve the user's request`;
  }

  if (IMAGE_TYPES.includes(fileType)) {
    return `User request: "${userPrompt}"

DO NOT ANSWER THE USER'S REQUEST. Your task is only to describe and provide context from this image.

Analyze this image and provide:
- Focus on elements most relevant to the user's request
- All visible text exactly as it appears
- Spatial context (location, layout, formatting of text)
- Description of visual elements (objects, people, scenes, colors, composition) with sufficient detail that a blind person can understand the image when the description is read aloud
- Relationships between text and visual elements
- Overall purpose or context of the image
- Simply provide the visual description with context - do not interpret, answer, or solve the user's request`;
  }

  // Fallback for unknown types
  return `User request: "${userPrompt}"

DO NOT ANSWER THE USER'S REQUEST. Your task is only to extract and provide context from this file.

Extract all relevant information from this file, prioritizing content most relevant to the user's request.`;
}

export const extractFileContext = action({
  args: {
    fileUrls: v.array(v.string()),
    fileTypes: v.array(v.string()),
    userPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log("Starting Gemini file context extraction...");
      console.log("Files:", args.fileUrls.length);
      console.log("User prompt:", args.userPrompt);

      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const contextResults: string[] = [];

      // Track total usage across all files
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTokens = 0;

      // Process each file
      for (let i = 0; i < args.fileUrls.length; i++) {
        const fileUrl = args.fileUrls[i];
        const fileType = args.fileTypes[i];

        console.log(`Processing file ${i + 1}/${args.fileUrls.length}: ${fileType}`);

        const prompt = getPromptTemplate(fileType, args.userPrompt);

        // Step 1: Upload file to Gemini Files API
        console.log(`Uploading file ${i + 1} to Gemini...`);

        // Fetch the file from the URL
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          console.error(`Failed to fetch file ${i + 1}`);
          contextResults.push(`[Error fetching file ${i + 1}]`);
          continue;
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        // Upload to Gemini Files API
        const uploadResponse = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": fileType,
              "X-Goog-Upload-Protocol": "raw",
              "X-Goog-Upload-Command": "upload, finalize",
            },
            body: fileBuffer,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Failed to upload file ${i + 1}:`, errorText);
          contextResults.push(`[Error uploading file ${i + 1}]`);
          continue;
        }

        const uploadData = await uploadResponse.json();
        const fileUri = uploadData.file?.uri;

        if (!fileUri) {
          console.error(`No file URI returned for file ${i + 1}`);
          contextResults.push(`[Error: No file URI for file ${i + 1}]`);
          continue;
        }

        console.log(`File ${i + 1} uploaded successfully:`, fileUri);

        // Step 2: Generate content using the uploaded file
        const generateResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt,
                    },
                    {
                      file_data: {
                        mime_type: fileType,
                        file_uri: fileUri,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.3,
              },
            }),
          }
        );

        console.log(`Generate response status for file ${i + 1}:`, generateResponse.status);

        if (!generateResponse.ok) {
          const errorText = await generateResponse.text();
          console.error(`Gemini generate error for file ${i + 1}:`, errorText);
          contextResults.push(`[Error generating context from file ${i + 1}]`);
          continue;
        }

        const generateData = await generateResponse.json();
        const extractedContext = generateData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        // Extract usage metadata
        const usageMetadata = generateData.usageMetadata;
        if (usageMetadata) {
          const inputTokens = usageMetadata.promptTokenCount || 0;
          const outputTokens = usageMetadata.candidatesTokenCount || 0;
          const tokens = usageMetadata.totalTokenCount || (inputTokens + outputTokens);

          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
          totalTokens += tokens;

          console.log(`File ${i + 1} usage: ${inputTokens} input, ${outputTokens} output, ${tokens} total tokens`);
        }

        if (extractedContext) {
          contextResults.push(`--- File ${i + 1} Context ---\n${extractedContext}`);
          console.log(`Successfully extracted context from file ${i + 1}`);
        } else {
          contextResults.push(`[No context extracted from file ${i + 1}]`);
          console.log(`No context extracted from file ${i + 1}`);
        }

        // Schedule file deletion after 5 minutes
        if (fileUri) {
          const fileName = uploadData.file?.name;
          console.log(`Scheduling deletion of file ${i + 1} (${fileName}) in 5 minutes`);

          // Delete after 5 minutes (300000ms)
          setTimeout(async () => {
            try {
              const deleteResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`,
                {
                  method: "DELETE",
                }
              );

              if (deleteResponse.ok) {
                console.log(`Successfully deleted file ${i + 1} (${fileName}) from Gemini`);
              } else {
                console.error(`Failed to delete file ${i + 1} (${fileName}):`, await deleteResponse.text());
              }
            } catch (error) {
              console.error(`Error deleting file ${i + 1} (${fileName}):`, error);
            }
          }, 300000); // 5 minutes in milliseconds
        }
      }

      const combinedContext = contextResults.join("\n\n");
      console.log("Context extraction completed");
      console.log(`Total Gemini usage: ${totalInputTokens} input, ${totalOutputTokens} output, ${totalTokens} total tokens`);

      return {
        context: combinedContext,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalTokens,
        },
      };
    } catch (error) {
      console.error("File context extraction failed:", error);
      throw error;
    }
  },
});
