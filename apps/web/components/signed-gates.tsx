"use client";

import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";

/** Client gates — Clerk v7 documents `<Show />` for SSR; these mirror classic SignedIn/SignedOut via `useAuth`. */
export function SignedIn({ children }: { children: ReactNode }): ReactNode {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: ReactNode }): ReactNode {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || isSignedIn) return null;
  return <>{children}</>;
}
