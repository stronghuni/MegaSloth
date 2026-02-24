# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MegaSloth is an AI-Powered Full Automation Agent that monitors Git repositories (GitHub, GitLab, Bitbucket) 24/7 and autonomously handles DevOps tasks. Uses multi-model LLM support (Claude, OpenAI, Gemini) with 84 built-in tools across 9 categories.

## Build & Development Commands

```bash
# Development
pnpm install          # Install dependencies
pnpm dev              # Development mode with hot reload
pnpm build            # Build TypeScript to dist/
pnpm start            # Run compiled version

# Testing & Quality
pnpm test             # Run Vitest in watch mode
pnpm test:run         # Run tests once (CI mode)
pnpm lint             # Run ESLint on src/
pnpm lint:fix         # Auto-fix ESLint issues

# Database (Drizzle ORM + SQLite)
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Drizzle Studio GUI

# Desktop App (from desktop/ directory)
cd desktop && pnpm dev        # Start Vite + Electron dev
cd desktop && pnpm build      # Build renderer + main
cd desktop && pnpm build:mac  # Build macOS DMG

# Docker
docker compose up -d  # Start with Redis
```

## Architecture

```
Webhooks (GitHub/GitLab/Bitbucket)
         │
         ↓
┌─────────────────────────────────────┐
│   Gateway Layer                     │
│   HttpServer:13000 | Webhook:3001   │
│   WebSocket:18789                   │
└─────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   Job Queue (BullMQ + Redis)        │
│   Scheduler (Croner for cron)       │
└─────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   Skill Engine                      │
│   Matches webhooks → SKILL.md files │
└─────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   Agent Core (LLM Loop)             │
│   Multi-turn with tool execution    │
└─────────────────────────────────────┘
         │
    ┌────┴──────┬──────────┬──────────┐
    ↓           ↓          ↓          ↓
  Git Tools   Local     LLM        Vault
  (30+)       Tools     Provider   (AES-256)
```

### Core Components

| Directory | Purpose |
|-----------|---------|
| `src/cli/` | Commander.js CLI (init, start, stop, config, status, skill, chat) |
| `src/agent/` | AgentCore LLM loop, context management, state |
| `src/tools/` | 84 tools: shell, filesystem, web, browser, git, memory, credentials |
| `src/skills/` | Skill engine + 8 built-in skills (pr-review, ci-fix, issue-triage, etc.) |
| `src/providers/` | LLM providers (Claude, OpenAI, Gemini) via factory pattern |
| `src/adapters/git/` | Platform adapters (GitHub/Octokit, GitLab/Gitbeaker, Bitbucket) |
| `src/gateway/` | HTTP server, webhook handlers, WebSocket |
| `src/queue/` | BullMQ job queue and worker |
| `src/storage/` | SQLite (Drizzle ORM), Redis cache |
| `src/credentials/` | OAuth provisioning, encrypted vault |
| `desktop/` | Electron app (React + Tailwind) |

### Request Flow

1. Webhook arrives at `WebhookServer:3001` → validated → added to BullMQ
2. Worker picks job → `SkillEngine` finds matching skill
3. Skill's SKILL.md becomes system prompt for `AgentCore`
4. Agent loops: LLM call → tool execution → results → repeat (max 10 turns)
5. Results broadcast via WebSocket to desktop app

## Key Patterns

- **Factory Pattern:** `LLMProviderFactory`, `GitAdapterFactory`
- **Registry Pattern:** `ToolRegistry`, `SkillRegistry`
- **Adapter Pattern:** Unified Git interface across platforms
- **Lazy Loading:** Dynamic imports in tools to avoid circular deps

## Extension Points

- **Add Tool:** Register in `src/tools/registry.ts` → `createDefaultToolRegistry()`
- **Add Skill:** Create `src/skills/builtin/<name>/SKILL.md` with YAML frontmatter
- **Add LLM Provider:** Implement `LLMProvider` interface in `src/providers/`
- **Add Git Platform:** Implement `GitProviderAdapter` in `src/adapters/git/`
- **Add Plugin:** Place in `.megasloth/plugins/` with plugin.json manifest
- **Add CLI Command:** Create in `src/cli/commands/` → register in index.ts

## Tech Stack

- **Runtime:** Node.js >= 22, TypeScript 5.7 (strict mode), pnpm
- **Backend:** Fastify, BullMQ, Drizzle ORM (SQLite), Redis
- **LLM SDKs:** @anthropic-ai/sdk, openai, @google/genai
- **Git:** Octokit, @gitbeaker/rest, bitbucket
- **Desktop:** Electron, React 19, Tailwind CSS, Vite
- **Testing:** Vitest
