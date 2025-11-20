"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CubeLoader } from "@/components/ui/cube-loader";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const user = useQuery(api.users.current);
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return; // Still loading

    if (!user || user.email !== "marwie0904@gmail.com") {
      router.push("/");
    }
  }, [user, router]);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CubeLoader />
      </div>
    );
  }

  if (!user || user.email !== "marwie0904@gmail.com") {
    return null;
  }

  return <>{children}</>;
}
