import React from "react";
import { cn } from "@/lib/utils.ts";

export function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      {children}
    </div>
  );
}

export function EmptyHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2 mb-4">{children}</div>;
}

export function EmptyMedia({ children, variant }: { children: React.ReactNode; variant?: "icon" | "image" }) {
  return (
    <div className={cn(
      "flex items-center justify-center mb-2",
      variant === "icon" && "w-12 h-12 rounded-full bg-muted text-muted-foreground [&_svg]:size-6"
    )}>
      {children}
    </div>
  );
}

export function EmptyTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground">{children}</h3>;
}

export function EmptyDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground max-w-xs">{children}</p>;
}

export function EmptyContent({ children }: { children: React.ReactNode }) {
  return <div className="mt-2">{children}</div>;
}

export default Empty;
