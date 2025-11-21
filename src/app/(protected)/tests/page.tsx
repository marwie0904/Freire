"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { Sidebar } from "@/components/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListChecks, Calendar, Menu, PanelLeft, CheckSquare, Layers, Plus, Trash2 } from "lucide-react";
import { CreateTestFromDocumentModal } from "@/components/tests/create-test-from-document-modal";
import { TestDisplayModal } from "@/components/tests/test-display-modal";
import { CubeLoader } from "@/components/ui/cube-loader";
import { useRouter } from "next/navigation";

export default function TestsPage() {
  const tests = useQuery(api.tests.list);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [generatedTestId, setGeneratedTestId] = useState<string | null>(null);
  const [selectedIncompleteTestId, setSelectedIncompleteTestId] = useState<string | null>(null);
  const [deleteTestId, setDeleteTestId] = useState<string | null>(null);
  const [deleteDialogPosition, setDeleteDialogPosition] = useState<{ x: number; y: number } | null>(null);
  const router = useRouter();

  // Fetch the selected incomplete test
  const selectedIncompleteTest = useQuery(
    api.tests.get,
    selectedIncompleteTestId ? { testId: selectedIncompleteTestId as Id<"tests"> } : "skip"
  );

  // Fetch the generated test
  const generatedTest = useQuery(
    api.tests.get,
    generatedTestId ? { testId: generatedTestId as Id<"tests"> } : "skip"
  );

  const submitTest = useMutation(api.testResponses.submit);
  const deleteTest = useMutation(api.tests.remove);

  const handleDeleteClick = (testId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTestId(testId);
    setDeleteDialogPosition({ x: e.clientX, y: e.clientY });
  };

  const confirmDelete = async () => {
    if (!deleteTestId) return;

    try {
      await deleteTest({ testId: deleteTestId as Id<"tests"> });
      setDeleteTestId(null);
    } catch (error) {
      console.error("Failed to delete test:", error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTestType = (test: any) => {
    const hasFlashcards = test.questions.some((q: any) => q.type === "flashcard");
    const hasMultipleChoice = test.questions.some((q: any) => q.type === "multiple_choice");

    if (hasFlashcards && hasMultipleChoice) return "mixed";
    if (hasFlashcards) return "flashcard";
    return "multiple_choice";
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleTestCreated = (testId: string) => {
    setGeneratedTestId(testId);
  };

  const handleTestDisplayClose = () => {
    setGeneratedTestId(null);
  };

  const handleTestClick = (test: any) => {
    // Don't allow clicking on generating tests
    if (test.isGenerating) return;

    if (!test.isCompleted) {
      setSelectedIncompleteTestId(test._id);
    } else {
      router.push(`/tests/${test._id}`);
    }
  };

  const handleIncompleteTestClose = () => {
    setSelectedIncompleteTestId(null);
  };

  const handleIncompleteTestSubmit = async (answers: Record<string, string | string[]>) => {
    if (!selectedIncompleteTest) return;

    try {
      await submitTest({
        testId: selectedIncompleteTest._id as Id<"tests">,
        conversationId: selectedIncompleteTest.conversationId,
        answers: JSON.stringify(answers),
      });
      // After submission, navigate to the test results page
      router.push(`/tests/${selectedIncompleteTest._id}`);
      setSelectedIncompleteTestId(null);
    } catch (error) {
      console.error("Failed to submit test:", error);
    }
  };

  const handleGeneratedTestSubmit = async (answers: Record<string, string | string[]>) => {
    if (!generatedTest) return;

    try {
      await submitTest({
        testId: generatedTest._id as Id<"tests">,
        conversationId: generatedTest.conversationId,
        answers: JSON.stringify(answers),
      });
      // After submission, navigate to the test results page
      router.push(`/tests/${generatedTest._id}`);
      setGeneratedTestId(null);
    } catch (error) {
      console.error("Failed to submit test:", error);
    }
  };

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
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed left-4 top-4 z-50"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <Sidebar
              activeConversationId={null}
              onSelectConversation={() => {}}
              onNewChat={() => {}}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 relative">
        {isSidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute left-4 top-4 z-10 h-8 w-8 hover:bg-black/10 dark:hover:bg-white/5"
          >
            <PanelLeft className="h-5 w-5 text-foreground" />
          </Button>
        )}

        <div className="flex h-screen flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-4 md:px-8 pt-6 pb-4 border-b border-border/40">
            <div className={`flex items-center gap-3 transition-all duration-300 ${isSidebarCollapsed ? 'md:ml-12' : ''} ml-12 md:ml-0`}>
              <ListChecks className="h-6 w-6 text-foreground" />
              <h1 className="text-xl md:text-2xl font-normal text-foreground">All Tests</h1>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)} className="whitespace-nowrap">
              <Plus className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">New Test</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>

          {/* Tests List */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-4xl px-4 md:px-8 py-8">
              {tests === undefined ? (
                <div className="grid gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 rounded-lg border border-border/40">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <Skeleton className="h-7 w-2/3" />
                            <Skeleton className="h-5 w-24 rounded-full" />
                          </div>
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-28" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : tests.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tests created yet</p>
                  <p className="text-sm mt-2">
                    Create a test from any conversation to get started
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {tests.map((test) => {
                    const testType = getTestType(test);
                    return (
                      <ContextMenu key={test._id}>
                        <ContextMenuTrigger asChild>
                          <div
                            onClick={() => handleTestClick(test)}
                            className={`block ${test.isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className={`group p-4 md:p-6 rounded-lg border border-border/40 transition-all ${!test.isGenerating && 'hover:border-border hover:bg-accent/5'}`}>
                          <div className="flex items-center gap-3 md:gap-6">
                            {/* Large Icon */}
                            <div className="flex-shrink-0 hidden sm:block">
                              {test.isGenerating ? (
                                <div className="h-14 w-14 rounded-lg flex items-center justify-center overflow-hidden">
                                  <CubeLoader
                                    size="md"
                                    variant={test.generationStatus === "uploading" ? "yellow" : "blue"}
                                  />
                                </div>
                              ) : (
                                <>
                                  {testType === "flashcard" && (
                                    <div className="h-14 w-14 rounded-lg bg-primary flex items-center justify-center">
                                      <Layers className="h-7 w-7 text-primary-foreground" />
                                    </div>
                                  )}
                                  {testType === "multiple_choice" && (
                                    <div className="h-14 w-14 rounded-lg bg-primary flex items-center justify-center">
                                      <CheckSquare className="h-7 w-7 text-primary-foreground" />
                                    </div>
                                  )}
                                  {testType === "mixed" && (
                                    <div className="h-14 w-14 rounded-lg bg-primary flex items-center justify-center">
                                      <ListChecks className="h-7 w-7 text-primary-foreground" />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 overflow-hidden">
                              {/* Badges */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {test.isGenerating ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs animate-pulse ${
                                      test.generationStatus === "uploading"
                                        ? "text-yellow-500 border-yellow-500"
                                        : "text-blue-500 border-blue-500"
                                    }`}
                                  >
                                    {test.generationStatus === "uploading" ? "Uploading files..." : "Generating test..."}
                                  </Badge>
                                ) : (
                                  <>
                                    {testType === "flashcard" && (
                                      <Badge variant="secondary" className="text-xs">
                                        Flashcard
                                      </Badge>
                                    )}
                                    {testType === "multiple_choice" && (
                                      <Badge variant="secondary" className="text-xs">
                                        Multiple Choice
                                      </Badge>
                                    )}
                                    {testType === "mixed" && (
                                      <Badge variant="secondary" className="text-xs">
                                        Mixed
                                      </Badge>
                                    )}
                                    {test.hasResponse && !test.isCompleted && (
                                      <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">
                                        Incomplete
                                      </Badge>
                                    )}
                                    {test.isCompleted && (
                                      <>
                                        <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                                          Complete
                                        </Badge>
                                        {test.score !== undefined && test.totalQuestions !== undefined && test.totalQuestions > 0 && (
                                          <Badge variant="outline" className="text-xs text-blue-500 border-blue-500">
                                            {Math.round((test.score / test.totalQuestions) * 100)}%
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* Title */}
                              <h3 className="text-base md:text-lg font-medium truncate">
                                {test.title}
                              </h3>

                              {/* Metadata (mobile) */}
                              <div className="sm:hidden text-xs text-muted-foreground mt-1 space-x-2">
                                <span>
                                  {test.isGenerating
                                    ? test.generationStatus === "uploading"
                                      ? "Uploading..."
                                      : "Generating..."
                                    : `${test.questions.length} Q`}
                                </span>
                                <span>•</span>
                                <span>
                                  {formatDate(test.createdAt)}
                                </span>
                              </div>
                            </div>

                            {/* Metadata (desktop) */}
                            <div className="hidden sm:flex flex-shrink-0 text-right text-sm text-muted-foreground space-y-1 flex-col">
                              <div>
                                {test.isGenerating
                                  ? test.generationStatus === "uploading"
                                    ? "Uploading files..."
                                    : "Generating test..."
                                  : `${test.questions.length} question${test.questions.length !== 1 ? "s" : ""}`}
                              </div>
                              <div>
                                {formatDate(test.createdAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={(e) => handleDeleteClick(test._id, e)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </main>

      {/* Modals */}
      <CreateTestFromDocumentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTestCreated={handleTestCreated}
      />

      {/* Modal for newly generated tests */}
      {generatedTest && (
        <TestDisplayModal
          open={!!generatedTestId}
          onOpenChange={(open) => {
            if (!open) handleTestDisplayClose();
          }}
          test={generatedTest}
          onSubmit={handleGeneratedTestSubmit}
        />
      )}

      {/* Modal for resuming incomplete tests */}
      {selectedIncompleteTest && (
        <TestDisplayModal
          open={!!selectedIncompleteTestId}
          onOpenChange={(open) => {
            if (!open) handleIncompleteTestClose();
          }}
          test={selectedIncompleteTest}
          onSubmit={handleIncompleteTestSubmit}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTestId} onOpenChange={(open) => !open && setDeleteTestId(null)}>
        <AlertDialogContent
          style={
            deleteDialogPosition
              ? {
                  position: "fixed",
                  left: `${deleteDialogPosition.x}px`,
                  top: `${deleteDialogPosition.y}px`,
                  transform: "translate(-50%, -50%)",
                }
              : undefined
          }
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Test</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this test? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
