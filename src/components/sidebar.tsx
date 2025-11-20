"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DailyUsageCircle } from "@/components/daily-usage-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MessageSquare,
  FolderKanban,
  Plus,
  ChevronDown,
  Trash2,
  PanelLeftClose,
  MoreHorizontal,
  Pin,
  Pencil,
  Folder,
  ListChecks,
  Moon,
  Sun,
  Layout,
  Bug,
  Lightbulb,
  Code,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/app/providers/theme-provider";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { BugReportModal } from "@/components/bug-report/bug-report-modal";
import { FeatureRequestModal } from "@/components/feature-request/feature-request-modal";
import { CubeLoader } from "@/components/ui/cube-loader";
import { AnimatedTitle } from "@/components/ui/animated-title";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";

type ActiveView = "chats" | "projects" | "tests" | "canvas";

const navigationItems: Array<{ icon: any; label: string; view: ActiveView }> = [
  { icon: MessageSquare, label: "Chats", view: "chats" },
  { icon: Layout, label: "Canvas", view: "canvas" },
  { icon: ListChecks, label: "Tests", view: "tests" },
  { icon: FolderKanban, label: "Projects", view: "projects" },
];

interface SidebarProps {
  activeConversationId?: Id<"conversations"> | null;
  onSelectConversation: (id: Id<"conversations">) => void;
  onNewChat: () => void;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  streamingConversationId?: Id<"conversations"> | null;
}

export function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onToggleCollapse,
  isCollapsed,
  streamingConversationId = null,
}: SidebarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuthActions();
  // Always keep sidebar on chats view, regardless of page
  const activeView = "chats";
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: "conversation" | "project"; id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [bugReportModalOpen, setBugReportModalOpen] = useState(false);
  const [featureRequestModalOpen, setFeatureRequestModalOpen] = useState(false);

  const conversations = useQuery(api.conversations.list);
  const projects = useQuery(api.projects.list);
  const allTests = useQuery(api.tests.list);
  const currentUser = useQuery(api.users.current);

  // Check if any test is currently generating
  const hasGeneratingTest = allTests?.some(test => test.isGenerating) || false;

  const createConversation = useMutation(api.conversations.create);
  const createProject = useMutation(api.projects.create);
  const deleteConversation = useMutation(api.conversations.remove);
  const deleteProject = useMutation(api.projects.remove);
  const deleteTest = useMutation(api.tests.remove);
  const renameConversation = useMutation(api.conversations.updateTitle);
  const renameProjectMutation = useMutation(api.projects.rename);
  const toggleConversationPin = useMutation(api.conversations.togglePin);
  const toggleProjectPin = useMutation(api.projects.togglePin);

  const handleNewChat = async () => {
    // Check if there's already an empty chat (messageCount === 0)
    const emptyChat = conversations?.find((conv) => conv.messageCount === 0);

    if (emptyChat) {
      // Redirect to the existing empty chat instead of creating a new one
      onSelectConversation(emptyChat._id);
      if (typeof window !== "undefined" && window.location.pathname !== "/") {
        window.location.href = "/";
      }
      return;
    }

    // Create new chat only if no empty chats exist
    const id = await createConversation({ title: "New Chat" });
    onNewChat();
    onSelectConversation(id);
    // Navigate to home page if we're creating a new chat
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/";
    }
  };

  const handleNewProject = async () => {
    const title = prompt("Enter project name:");
    if (!title) return;

    const description = prompt("Enter project description (optional):");

    await createProject({
      title,
      description: description || undefined,
      instructions: "",
    });
  };

  const handleDeleteConversation = async (id: Id<"conversations">) => {
    await deleteConversation({ conversationId: id });
    if (activeConversationId === id) {
      onNewChat();
    }
  };

  const handleDeleteProject = async (id: Id<"projects">) => {
    await deleteProject({ id });
  };

  const handleRenameClick = (type: "conversation" | "project", id: string, currentName: string) => {
    setRenameTarget({ type, id, currentName });
    setRenameValue(currentName);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameValue.trim()) return;

    if (renameTarget.type === "conversation") {
      await renameConversation({
        conversationId: renameTarget.id as Id<"conversations">,
        title: renameValue.trim(),
      });
    } else {
      await renameProjectMutation({
        id: renameTarget.id as Id<"projects">,
        title: renameValue.trim(),
      });
    }

    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleTogglePin = async (type: "conversation" | "project", id: string) => {
    if (type === "conversation") {
      await toggleConversationPin({ conversationId: id as Id<"conversations"> });
    } else {
      await toggleProjectPin({ id: id as Id<"projects"> });
    }
  };

  const handleConversationClick = (conv: { _id: Id<"conversations">; projectId?: Id<"projects"> | null }) => {
    onSelectConversation(conv._id);
    const url = conv.projectId
      ? `/projects/${conv.projectId}?conversation=${conv._id}`
      : `/?conversation=${conv._id}`;
    router.push(url);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully!");
      router.push("/auth/sign-in");
    } catch (error) {
      toast.error("Failed to sign out. Please try again.");
      console.error("Sign out error:", error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations;

    const query = searchQuery.toLowerCase();
    return conversations.filter((conv) =>
      (conv.title || "New Chat").toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  return (
    <div className="flex h-screen w-[280px] flex-col bg-sidebar-secondary">
      {/* App Name */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-black/10 dark:hover:bg-white/5"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose className="h-5 w-5 text-foreground" />
          </Button>
          <h1 className="text-xl font-bold font-[family-name:var(--font-merriweather)] text-foreground">
            Kiyub
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Daily Usage Circle */}
          <DailyUsageCircle />

          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-primary/10 text-primary border border-primary/20">
            Alpha
          </span>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="px-4 pb-4">
        <Button
          onClick={handleNewChat}
          variant="ghost"
          className="w-full justify-start gap-2 text-base font-normal hover:bg-black/10 dark:hover:bg-white/5 text-primary"
          size="sm"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Plus className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          New chat
        </Button>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 px-2">
        {navigationItems.map((item) => {
          const isProjectsDisabled = item.view === "projects";

          if (isProjectsDisabled) {
            return (
              <div key={item.label} className="block">
                <Button
                  variant="ghost"
                  className="w-full justify-between gap-3 text-sidebar-text/50 cursor-not-allowed hover:bg-transparent text-base"
                  size="sm"
                  disabled
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <span className="text-xs">coming soon</span>
                </Button>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={
                item.view === "chats"
                  ? "/chats"
                  : item.view === "canvas"
                  ? "/canvas"
                  : item.view === "tests"
                  ? "/tests"
                  : "/"
              }
              className="block"
            >
              <Button
                variant="ghost"
                className="w-full justify-between gap-3 hover:bg-black/10 dark:hover:bg-white/5 text-sidebar-text text-base"
                size="sm"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
                {item.view === "tests" && hasGeneratingTest && (
                  <CubeLoader size="xs" variant="primary" />
                )}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="my-4" />

      {/* Content Section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-4">
            {activeView === "chats" ? (
              <div>
                {conversations === undefined ? (
                  <div className="px-2 py-4 text-base text-sidebar-text">
                    Loading...
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="px-2 py-4 text-base text-sidebar-text">
                    {searchQuery.trim() ? "No conversations found" : "No conversations yet"}
                  </div>
                ) : (
                  <>
                    {/* Pinned Conversations */}
                    {filteredConversations.filter((conv) => conv.isPinned).length > 0 && (
                      <div className="mb-6">
                        <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-text">
                          Pinned
                        </h3>
                        <div className="space-y-1">
                          {filteredConversations.filter((conv) => conv.isPinned).map((conv) => (
                      <div key={conv._id} className="group relative">
                        {/* Cube loader when this conversation is streaming */}
                        {streamingConversationId === conv._id && (
                          <div className="absolute right-1 top-1 z-10 h-6 w-6 flex items-center justify-center">
                            <CubeLoader size="xs" variant="primary" speed="normal" />
                          </div>
                        )}
                        {/* Project Icon - Always visible for project conversations when not streaming */}
                        {conv.projectId && streamingConversationId !== conv._id && (
                          <div className="absolute right-1 top-1 z-10 h-6 w-6 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1 z-10 h-6 w-6 opacity-0 group-hover:opacity-100 bg-sidebar-secondary hover:bg-black/20 dark:hover:bg-white/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleTogglePin("conversation", conv._id)}>
                              <Pin className={`mr-2 h-4 w-4 ${conv.isPinned ? "fill-current" : ""}`} />
                              {conv.isPinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRenameClick("conversation", conv._id, conv.title || "New Chat")}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <div className="my-1 h-px bg-border" />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete this
                                    conversation and all its messages.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteConversation(conv._id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start font-normal pr-8 text-sidebar-text hover:bg-black/10 dark:hover:bg-white/10",
                            activeConversationId === conv._id && "bg-black/10 dark:bg-white/10"
                          )}
                          size="sm"
                          onClick={() => handleConversationClick(conv)}
                        >
                          <AnimatedTitle
                            title={conv.title || "New Chat"}
                            className="truncate text-base max-w-[200px]"
                            shouldAnimate={conv.isTitleAutoGenerated ?? false}
                          />
                        </Button>
                      </div>
                    ))}
                        </div>
                      </div>
                    )}

                    {/* Regular Conversations */}
                    {filteredConversations.filter((conv) => !conv.isPinned).length > 0 && (
                      <div>
                        <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-text">
                          Conversations
                        </h3>
                        <div className="space-y-1">
                          {filteredConversations.filter((conv) => !conv.isPinned).map((conv) => (
                      <div key={conv._id} className="group relative">
                        {/* Cube loader when this conversation is streaming */}
                        {streamingConversationId === conv._id && (
                          <div className="absolute right-1 top-1 z-10 h-6 w-6 flex items-center justify-center">
                            <CubeLoader size="xs" variant="primary" speed="normal" />
                          </div>
                        )}
                        {/* Project Icon - Always visible for project conversations when not streaming */}
                        {conv.projectId && streamingConversationId !== conv._id && (
                          <div className="absolute right-1 top-1 z-10 h-6 w-6 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1 z-10 h-6 w-6 opacity-0 group-hover:opacity-100 bg-sidebar-secondary hover:bg-black/20 dark:hover:bg-white/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleTogglePin("conversation", conv._id)}>
                              <Pin className={`mr-2 h-4 w-4 ${conv.isPinned ? "fill-current" : ""}`} />
                              {conv.isPinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRenameClick("conversation", conv._id, conv.title || "New Chat")}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <div className="my-1 h-px bg-border" />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete this
                                    conversation and all its messages.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteConversation(conv._id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start font-normal pr-8 text-sidebar-text hover:bg-black/10 dark:hover:bg-white/10",
                            activeConversationId === conv._id && "bg-black/10 dark:bg-white/10"
                          )}
                          size="sm"
                          onClick={() => handleConversationClick(conv)}
                        >
                          <AnimatedTitle
                            title={conv.title || "New Chat"}
                            className="truncate text-base max-w-[200px]"
                            shouldAnimate={conv.isTitleAutoGenerated ?? false}
                          />
                        </Button>
                      </div>
                    ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div></div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* User Profile */}
      <div className="relative p-4 space-y-2">
        {/* Vignette effect to indicate more content above */}
        <div className="absolute top-0 left-0 right-0 h-16 -mt-16 pointer-events-none bg-gradient-to-b from-transparent via-sidebar-secondary/70 to-sidebar-secondary" />

        {/* Developer Feedback Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-dashed hover:border-solid hover:bg-accent/10 transition-colors"
            >
              <Code className="h-4 w-4" />
              <span>Developer Feedback</span>
              <ChevronDown className="ml-auto h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setFeatureRequestModalOpen(true)}>
              <Lightbulb className="mr-2 h-4 w-4" />
              Feature Request
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBugReportModalOpen(true)}>
              <Bug className="mr-2 h-4 w-4" />
              Bug Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-2 hover:bg-black/10 dark:hover:bg-white/5"
              size="lg"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(currentUser?.name, currentUser?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start text-left">
                <span className="text-sm font-medium text-sidebar-text">
                  {currentUser?.name || currentUser?.email || "User"}
                </span>
                <span className="text-xs text-sidebar-text opacity-70">Alpha Test</span>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-text" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Layout className="mr-2 h-4 w-4" />
              System
            </DropdownMenuItem>
            <div className="my-1 h-px bg-border" />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-500 focus:text-red-500">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Rename Dialog */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rename {renameTarget?.type === "conversation" ? "Conversation" : "Project"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for this {renameTarget?.type === "conversation" ? "conversation" : "project"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameSubmit();
                }
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter name..."
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRenameDialogOpen(false);
              setRenameTarget(null);
              setRenameValue("");
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feature Request Modal */}
      <FeatureRequestModal
        open={featureRequestModalOpen}
        onOpenChange={setFeatureRequestModalOpen}
      />

      {/* Bug Report Modal */}
      <BugReportModal
        open={bugReportModalOpen}
        onOpenChange={setBugReportModalOpen}
      />
    </div>
  );
}
