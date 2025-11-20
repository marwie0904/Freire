"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
import { Search, MoreHorizontal, Trash2, Pin, Pencil, Folder, Menu, PanelLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function ChatsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<Id<"conversations"> | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const conversations = useQuery(api.conversations.list);
  const deleteConversation = useMutation(api.conversations.remove);
  const renameConversation = useMutation(api.conversations.updateTitle);
  const toggleConversationPin = useMutation(api.conversations.togglePin);

  const handleSelectConversation = (id: Id<"conversations">) => {
    setActiveConversationId(id);
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
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

  const handleDeleteConversation = async (id: Id<"conversations">) => {
    await deleteConversation({ conversationId: id });
  };

  const handleRenameClick = (id: string, currentName: string) => {
    setRenameTarget({ id, currentName });
    setRenameValue(currentName);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameValue.trim()) return;

    await renameConversation({
      conversationId: renameTarget.id as Id<"conversations">,
      title: renameValue.trim(),
    });

    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleTogglePin = async (id: string) => {
    await toggleConversationPin({ conversationId: id as Id<"conversations"> });
  };

  const handleConversationClick = (conv: { _id: Id<"conversations">; projectId?: Id<"projects"> | null }) => {
    const url = conv.projectId
      ? `/projects/${conv.projectId}?conversation=${conv._id}`
      : `/?conversation=${conv._id}`;
    router.push(url);
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:block transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
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
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewChat}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <main className="flex-1 relative bg-background flex flex-col">
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

        {/* Header */}
        <div className="border-b border-border bg-card px-8 py-6">
          <h1 className="text-3xl font-bold mb-4">Chats</h1>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
        {conversations === undefined ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery.trim() ? "No conversations found" : "No conversations yet"}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Pinned Conversations */}
            {filteredConversations.filter((conv) => conv.isPinned).length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Pinned
                </h2>
                <div className="space-y-2">
                  {filteredConversations.filter((conv) => conv.isPinned).map((conv) => (
                    <div
                      key={conv._id}
                      className="group relative bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      {/* Project Icon */}
                      {conv.projectId && (
                        <div className="absolute right-4 top-4 z-10 h-6 w-6 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}

                      {/* Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-4 z-10 h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleTogglePin(conv._id)}>
                            <Pin className={`mr-2 h-4 w-4 ${conv.isPinned ? "fill-current" : ""}`} />
                            {conv.isPinned ? "Unpin" : "Pin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRenameClick(conv._id, conv.title || "New Chat")}>
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

                      {/* Conversation Content */}
                      <div
                        className="cursor-pointer pr-10"
                        onClick={() => handleConversationClick(conv)}
                      >
                        <h3 className="text-lg font-medium mb-1">
                          {conv.title || "New Chat"}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{conv.messageCount || 0} messages</span>
                          <span>•</span>
                          <span>{formatTimestamp(conv._creationTime)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Conversations */}
            {filteredConversations.filter((conv) => !conv.isPinned).length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  All Conversations
                </h2>
                <div className="space-y-2">
                  {filteredConversations.filter((conv) => !conv.isPinned).map((conv) => (
                    <div
                      key={conv._id}
                      className="group relative bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      {/* Project Icon */}
                      {conv.projectId && (
                        <div className="absolute right-4 top-4 z-10 h-6 w-6 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}

                      {/* Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-4 top-4 z-10 h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleTogglePin(conv._id)}>
                            <Pin className={`mr-2 h-4 w-4 ${conv.isPinned ? "fill-current" : ""}`} />
                            {conv.isPinned ? "Unpin" : "Pin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRenameClick(conv._id, conv.title || "New Chat")}>
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

                      {/* Conversation Content */}
                      <div
                        className="cursor-pointer pr-10"
                        onClick={() => handleConversationClick(conv)}
                      >
                        <h3 className="text-lg font-medium mb-1">
                          {conv.title || "New Chat"}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{conv.messageCount || 0} messages</span>
                          <span>•</span>
                          <span>{formatTimestamp(conv._creationTime)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* Rename Dialog */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for this conversation.
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
    </div>
  );
}
