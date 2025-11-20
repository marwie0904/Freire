"use client";

import { useState } from "react";
import { Flag, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface FlagFeedbackProps {
  messageId?: string;
  conversationId?: Id<"conversations">;
  userQuestion: string;
  aiResponse: string;
  aiModel: string;
}

export function FlagFeedback({
  messageId,
  conversationId,
  userQuestion,
  aiResponse,
  aiModel,
}: FlagFeedbackProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const currentUser = useQuery(api.users.current);
  const submitFeedback = useMutation(api.responseFeedback.submit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);

    try {
      await submitFeedback({
        description: description.trim(),
        userQuestion,
        aiResponse,
        aiModel,
        userName: currentUser?.name,
        userEmail: currentUser?.email,
        messageId: messageId as Id<"messages"> | undefined,
        conversationId,
      });

      // Show success state
      setSubmitted(true);
      setDescription("");

      // Close popover after a brief delay
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title="Flag response"
        >
          <Flag className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        {submitted ? (
          <div className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-green-500">
              <span className="text-lg">✓</span>
              <span className="text-sm font-medium">Feedback submitted!</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Report Issue</span>
            </div>
            <Textarea
              placeholder="Please describe issue with this response"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] resize-none text-sm"
              disabled={isSubmitting}
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              className="w-full gap-2"
              disabled={!description.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>Submitting...</>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Submit
                </>
              )}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
