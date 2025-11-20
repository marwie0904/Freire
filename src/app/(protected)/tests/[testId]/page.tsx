"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Sidebar } from "@/components/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuestionRenderer } from "@/components/tests/question-renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ListChecks, Menu, PanelLeft, MoreVertical, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TextSelectionHandler } from "@/components/text-selection-handler";

export default function TestReviewPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.testId as string;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const test = useQuery(api.tests.get, { testId: testId as Id<"tests"> });
  const testResponses = useQuery(
    api.testResponses.getByTest,
    testId ? { testId: testId as Id<"tests"> } : "skip"
  );

  // Load conversation messages for little freire context
  const conversationMessages = useQuery(
    api.messages.getAll,
    test?.conversationId ? { conversationId: test.conversationId } : "skip"
  );

  const deleteTest = useMutation(api.tests.remove);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Get the most recent response (if any)
  const latestResponse = testResponses?.[0];
  const userAnswers = latestResponse
    ? JSON.parse(latestResponse.answers)
    : undefined;

  const handleRegenerate = async () => {
    if (!test) return;

    if (!confirm("This will generate a new test with the same settings. Continue?")) {
      return;
    }

    setIsRegenerating(true);

    try {
      // Extract test types from questions
      const testTypes = Array.from(
        new Set(test.questions.map((q) => q.type))
      ).map((type) => {
        if (type === "multiple_choice") return "multiple_choice";
        if (type === "written") return "written";
        if (type === "fill_blank") return "fill_blank";
        if (type === "flashcard") return "flashcard";
        return type;
      });

      const response = await fetch("/api/generate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: test.conversationId,
          testTypes,
          questionCount: test.questions.length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate test");
      }

      // Navigate to the new test
      router.push(`/tests/${data.testId}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to regenerate test");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this test? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteTest({ testId: testId as Id<"tests"> });
      router.push("/tests");
    } catch (error) {
      alert("Failed to delete test");
    }
  };

  if (test === undefined) {
    return (
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className={`hidden md:block transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
          <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'}`}>
            <Sidebar
              activeConversationId={null}
              onSelectConversation={() => {}}
              onNewChat={() => {}}
              onToggleCollapse={toggleSidebar}
              isCollapsed={isSidebarCollapsed}
            />
          </div>
        </aside>

        {/* Mobile Sidebar */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-4 z-50"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <Sidebar
              activeConversationId={null}
              onSelectConversation={() => {}}
              onNewChat={() => {}}
            />
          </SheetContent>
        </Sheet>

        {/* Main Content Skeleton */}
        <main className="flex-1 relative">
          {isSidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="absolute left-4 top-4 z-10 h-8 w-8 hover:bg-white/5"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="flex h-screen flex-col bg-background">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-border/40">
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded" />
                <div>
                  <Skeleton className="h-8 w-64 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>

            {/* Questions Skeleton */}
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-3xl px-8 py-8">
                <div className="space-y-8">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="p-6 rounded-lg border border-border/40 bg-card"
                    >
                      <Skeleton className="h-4 w-32 mb-4" />
                      <Skeleton className="h-6 w-full mb-4" />
                      {/* Alternate between multiple choice and flashcard skeleton */}
                      {i % 2 === 0 ? (
                        // Multiple choice skeleton (with options)
                        <div className="space-y-2">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ) : (
                        // Flashcard skeleton (single card)
                        <div className="space-y-4">
                          <div className="p-8 rounded-lg border border-border/40 bg-muted/30">
                            <Skeleton className="h-6 w-full mb-2" />
                            <Skeleton className="h-6 w-3/4" />
                          </div>
                          <Skeleton className="h-9 w-32" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        </main>
      </div>
    );
  }

  if (test === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-muted-foreground">Test not found</p>
          <Link href="/tests">
            <Button variant="ghost" className="mt-4">
              Back to Tests
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:block transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'}`}>
          <Sidebar
            activeConversationId={null}
            onSelectConversation={() => {}}
            onNewChat={() => {}}
            onToggleCollapse={toggleSidebar}
            isCollapsed={isSidebarCollapsed}
          />
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet>
        <SheetTrigger asChild className="md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-4 z-50"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <Sidebar
            activeConversationId={null}
            onSelectConversation={() => {}}
            onNewChat={() => {}}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 relative">
        {isSidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute left-4 top-4 z-10 h-8 w-8 hover:bg-white/5"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="flex h-screen flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-4">
              <Link href="/tests">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-normal">{test.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {test.questions.length} question{test.questions.length !== 1 ? "s" : ""}
                  {latestResponse && (
                    <span>
                      {" "}• Score: {latestResponse.score}/{latestResponse.totalQuestions} (
                      {Math.round((latestResponse.score / latestResponse.totalQuestions) * 100)}%)
                    </span>
                  )}
                  {!latestResponse && <span> • Not yet attempted</span>}
                </p>
              </div>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="gap-2"
                >
                  <RotateCw className="h-4 w-4" />
                  {isRegenerating ? "Regenerating..." : "Re-generate Test"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Test
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Questions Review */}
          <ScrollArea className="flex-1">
            <TextSelectionHandler
              conversationContext={conversationMessages || []}
              model="openai/gpt-oss-120b"
            >
              <div className="mx-auto max-w-3xl px-8 py-8">
                <div className="space-y-8">
                  {test.questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="p-6 rounded-lg border border-border/40 bg-card"
                    >
                      <div className="mb-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          Question {index + 1} of {test.questions.length}
                        </span>
                      </div>

                      <QuestionRenderer
                        question={question}
                        answer={userAnswers?.[question.id]}
                        onAnswerChange={() => {}}
                        showCorrectAnswer={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TextSelectionHandler>
          </ScrollArea>
        </div>
      </main>
    </div>
  );
}
