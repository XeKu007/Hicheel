import { type NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";

/**
 * Called by Stack Auth afterSignIn redirect.
 * Warms the Redis org context cache then redirects to dashboard.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  let destination = "/dashboard";

  try {
    await getOrgContext();
  } catch (err) {
    // Next.js redirect() throws an object with a `digest` property starting with "NEXT_REDIRECT"
    if (
      typeof err === "object" && err !== null &&
      "digest" in err && typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      // Extract the redirect destination from the digest: "NEXT_REDIRECT;replace;/onboarding"
      const parts = (err as { digest: string }).digest.split(";");
      const redirectPath = parts[2];
      if (redirectPath && redirectPath.startsWith("/")) {
        destination = redirectPath;
      }
    }
    // Other errors (DB down, etc.) — still redirect to dashboard
  }

  // Override with explicit return_to param if present
  const returnTo = request.nextUrl.searchParams.get("after_auth_return_to");
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    destination = returnTo;
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
