"use client";

import { AdminSidebar } from "@/components/admin-sidebar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AdminGuard } from "@/components/auth/admin-guard";
import { useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <AuthGuard>
      <AdminGuard>
        <div className="flex h-screen">
          <AdminSidebar
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </AdminGuard>
    </AuthGuard>
  );
}
