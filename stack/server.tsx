import "server-only";

import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  urls: {
    afterSignIn: "/api/auth/warm-and-redirect",
    afterSignUp: "/api/auth/warm-and-redirect",
  },
});
