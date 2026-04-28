# Architecture Diagram

## System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                        │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js     │  │  SWR Cache   │  │  SSE EventSource     │  │
│  │  App Router  │  │  (client)    │  │  (real-time updates) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS SERVER (Vercel)                      │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  Middleware │  │  API Routes  │  │  Server Components   │    │
│  │  (Auth+RBAC)│  │  /api/*      │  │  (SSR pages)         │    │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘    │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   lib/ (Business Logic)                 │    │
│  │                                                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐   │    │
│  │  │  org.ts  │  │ actions/ │  │gamifica- │  │i18n/   │   │    │
│  │  │ (context)│  │(CRUD)    │  │tion/     │  │(MN/EN) │   │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌──────────────┐   ┌──────────────────────────────────────────┐
│  Stack Auth  │   │              External Services           │
│  (Identity)  │   │                                          │
│              │   │  ┌──────────────┐  ┌──────────────────┐  │
│  - JWT       │   │  │ Prisma       │  │  Upstash Redis   │  │
│  - Sessions  │   │  │ Postgres     │  │  (Cache + PubSub)│  │
│  - Teams     │   │  │ (Primary DB) │  │                  │  │
└──────────────┘   │  └──────────────┘  └──────────────────┘  │
                   │                                          │
                   │  ┌──────────────┐                        │
                   │  │  Supabase    │                        │
                   │  │  Storage     │                        │
                   │  │ (Images)     │                        │
                   │  └──────────────┘                        │
                   └──────────────────────────────────────────┘
```

## Data Flow

```
User Action
    │
    ▼
Next.js Middleware (Auth check via Stack Auth)
    │
    ├─── Unauthenticated → /sign-in
    ├─── No org → /onboarding
    │
    ▼
Server Component / API Route
    │
    ├─── Redis Cache HIT → return cached data (~10ms)
    │
    └─── Redis Cache MISS
              │
              ▼
         Prisma ORM → Prisma Postgres
              │
              ▼
         Cache result in Redis
              │
              ▼
         Return to client
```

## Multi-tenant Architecture

```
Organization A          Organization B
┌─────────────┐         ┌─────────────┐
│ Manager     │         │ Manager     │
│ Staff 1     │         │ Staff 1     │
│ Staff 2     │         │ Staff 2     │
│             │         │             │
│ Products    │         │ Products    │
│ Alerts      │         │ Alerts      │
│ Leaderboard │         │ Leaderboard │
└─────────────┘         └─────────────┘
      │                       │
      └───────────┬───────────┘
                  │
         Shared Infrastructure
         (Prisma Postgres, Redis, Stack Auth)
         All queries scoped by organizationId
```

## Database Schema

```
Organization ──┬── Member ──── StaffAction
               ├── Product     Badge
               ├── Alert
               ├── Invitation
               └── MembershipRequest
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router, Server Components) |
| Styling | Tailwind CSS + CSS Variables |
| State | SWR + useOptimistic + useCallback/useMemo |
| Real-time | Server-Sent Events + Redis pub/sub |
| Auth | Stack Auth (JWT + Sessions) |
| Database | Prisma ORM + Prisma Postgres |
| Cache | Upstash Redis |
| Storage | Supabase Storage |
| i18n | Custom (MN/EN) |
| Gamification | Points + Badges + Leaderboard |
| Alerts | Low stock + Anomaly detection |
