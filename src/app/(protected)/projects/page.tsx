"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, PanelLeft } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectModal } from "@/components/projects/create-project-modal";
import { Sidebar } from "@/components/sidebar";
import { Id } from "../../../convex/_generated/dataModel";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<Id<"conversations"> | null>(null);

  const filteredProjects = projects?.filter((project) =>
    project.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectConversation = (id: Id<"conversations">) => {
    setActiveConversationId(id);
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className={`transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[280px]'}`}>
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

      {/* Main Content */}
      <div className="flex flex-1 flex-col bg-background relative">
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
        <div className="border-b border-border px-8 py-6">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-semibold text-foreground">Projects</h1>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                + New project
              </Button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Sort by
                <Button variant="ghost" size="sm" className="ml-2">
                  Activity ▾
                </Button>
              </span>
            </div>

            {filteredProjects === undefined ? (
              <div className="text-center text-muted-foreground">Loading...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center text-muted-foreground">
                {searchQuery ? "No projects found" : "No projects yet"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Project Modal */}
        <CreateProjectModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
        />
      </div>
    </div>
  );
}
