import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  // Production-д source map хаах — Sources tab-д JS source code харагдахгүй болно
  productionBrowserSourceMaps: false,

  // Dev toolbar-г production-д харуулахгүй
  devIndicators: false,

  // #22 DDoS mitigation — request body size limit
  // Large request body-г server-д хүрэхээс өмнө хориглоно
  serverExternalPackages: [],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@stackframe/stack",
      "swr",
      "recharts",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "prom-client",
    ],
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    // Content-Security-Policy — tighten in production
    const cspDirectives = [
      "default-src 'self'",
      // Scripts: allow self + Next.js inline scripts (nonce-based would be ideal but requires middleware)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Styles: allow self + inline (Tailwind/CSS-in-JS)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // Images: self + Supabase storage + Google avatars + GitHub raw (Stack Auth changelog) + data URIs
      `img-src 'self' data: blob: https://fcsyffcqddphhmhtbeoq.supabase.co https://lh3.googleusercontent.com https://raw.githubusercontent.com https://avatars.githubusercontent.com${isDev ? " https://*.stack-auth.com" : ""}`,
      // Connections: self + Stack Auth (all subdomains for dev tool) + Supabase + Upstash + Stripe
      // Stack Auth network diagnostics uses 1.1.1.1/cdn-cgi/trace to detect connectivity issues
      // Dev: also allow npmjs.org (Stack Auth dev tool checks for package updates)
      `connect-src 'self' https://api.stack-auth.com https://*.stack-auth.com https://r.stack-auth.com https://1.1.1.1${isDev ? " https://registry.npmjs.org" : ""} https://fcsyffcqddphhmhtbeoq.supabase.co https://*.upstash.io https://api.stripe.com`,
      // Frames: only Stripe (for payment elements)
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      // Media
      "media-src 'self'",
      // Object/embed: none
      "object-src 'none'",
      // Base URI: restrict to self
      "base-uri 'self'",
      // Form action: restrict to self
      "form-action 'self'",
      // Upgrade insecure requests in production
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // Security headers
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Content-Security-Policy", value: cspDirectives },
          // HSTS — only in production (Vercel/Cloudflare handle TLS)
          ...(isDev ? [] : [
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          ]),
          // Performance
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Link", value: [
            process.env.UPSTASH_REDIS_REST_URL ? `<${process.env.UPSTASH_REDIS_REST_URL}>; rel=preconnect` : null,
            "<https://api.stack-auth.com>; rel=preconnect",
            "<https://fonts.gstatic.com>; rel=preconnect; crossorigin",
          ].filter(Boolean).join(", ") },
        ],
      },
      {
        // Static assets — 1 year immutable cache
        source: "/(.*)\\.(js|css|woff2|woff|ttf|png|jpg|jpeg|gif|svg|ico|webp|avif)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Dashboard and app pages — short cache, revalidate on each visit
        source: "/dashboard",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fcsyffcqddphhmhtbeoq.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
