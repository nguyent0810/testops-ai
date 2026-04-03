"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { SignedIn, SignedOut } from "@/components/signed-gates";

export function LandingPage(): ReactElement {
  return (
    <main style={{ padding: "2rem", maxWidth: "36rem" }}>
      <h1>Test Management</h1>
      <p>Internal Alpha — public landing.</p>
      <SignedOut>
        <p>
          <SignInButton mode="modal">
            <button type="button">Sign in</button>
          </SignInButton>{" "}
          or{" "}
          <Link href="/sign-in">sign in</Link> / <Link href="/sign-up">sign up</Link>
        </p>
      </SignedOut>
      <SignedIn>
        <p>
          <Link href="/workspace">Open workspace</Link>
        </p>
      </SignedIn>
    </main>
  );
}
