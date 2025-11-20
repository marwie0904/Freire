"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectDetail } from "@/components/projects/project-detail";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation");

  return (
    <ProjectDetail
      projectId={projectId as Id<"projects">}
      initialConversationId={conversationId as Id<"conversations"> | null}
    />
  );
}
