"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs/legacy";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.44a5.5 5.5 0 0 1-2.39 3.6v3h3.86c2.26-2.08 3.58-5.15 3.58-8.79Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.86-3a7.15 7.15 0 0 1-4.07 1.16 7.28 7.28 0 0 1-6.84-5.02H1.16v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.13 14.22a7.2 7.2 0 0 1 0-4.44V6.67H1.16a12 12 0 0 0 0 10.66l3.97-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.16 6.67l3.97 3.11A7.28 7.28 0 0 1 12 4.75Z"
      />
    </svg>
  );
}

// The only sign-in method QuizPath supports (spec section 3): a single,
// explicit "Continue with Google" button built on Clerk's headless
// useSignIn hook rather than the prebuilt <SignIn> widget, so there's no
// ambiguity about other methods being available.
export function GoogleSignInButton() {
  const { signIn, isLoaded } = useSignIn();
  const [isRedirecting, setIsRedirecting] = useState(false);

  async function handleClick() {
    if (!isLoaded || isRedirecting) return;
    setIsRedirecting(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/",
      });
    } catch {
      setIsRedirecting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isLoaded || isRedirecting}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-5 py-3.5 font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {isRedirecting ? "Redirecting to Google…" : "Continue with Google"}
    </button>
  );
}
