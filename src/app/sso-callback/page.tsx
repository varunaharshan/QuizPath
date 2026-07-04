import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

// Clerk redirects here mid-flow to complete the Google OAuth handshake
// started by GoogleSignInButton, then forwards to redirectUrlComplete ("/").
export default function SSOCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
