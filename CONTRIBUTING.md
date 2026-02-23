# Contributing to MegaSloth

Thank you for your interest in contributing to MegaSloth! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- Redis
- Git

### Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/your-username/MegaSloth.git
cd MegaSloth

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start in development mode
pnpm dev
```

### Project Structure

```
src/
├── adapters/          # Git platform & notification adapters
├── agent/             # AI agent core
├── cli/               # CLI commands
├── config/            # Configuration schemas
├── gateway/           # HTTP, Webhook, WebSocket servers
├── github-app/        # GitHub App integration
├── memory/            # Graph memory system
├── plugins/           # Plugin system
├── providers/         # LLM providers (Claude, OpenAI, Gemini)
├── queue/             # BullMQ job queue
├── scheduler/         # Cron scheduler
├── skills/            # Skill engine + built-in skills
├── storage/           # SQLite + Drizzle ORM
├── tools/             # Tool registry (40+ tools)
└── utils/             # Logger, helpers
```

## Development Workflow

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation changes
- `refactor/description` — Code refactoring
- `test/description` — Test additions/changes
- `chore/description` — Maintenance tasks

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Gemini streaming support
fix: resolve webhook signature validation
docs: update API reference
refactor: simplify tool registry
test: add agent core unit tests
chore: update dependencies
```

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `pnpm test`
4. Run lint: `pnpm lint`
5. Submit a PR with a clear description

### Code Style

- TypeScript strict mode
- ESLint for linting
- No `any` types (use `unknown` if needed)
- Prefer named exports
- Use `getLogger()` for logging

## Adding Features

### Adding a New Tool

1. Open `src/tools/registry.ts`
2. Add a new `registry.register()` call in `createDefaultToolRegistry()`
3. Tools need: `category`, `definition` (name, description, input_schema), `handler`

### Adding a New Skill

1. Create `src/skills/builtin/your-skill/SKILL.md`
2. Add YAML frontmatter with name, triggers, tools
3. Write the AI prompt in markdown

### Adding a New LLM Provider

1. Create `src/providers/your-provider.provider.ts`
2. Implement the `LLMProvider` interface
3. Add to `src/providers/factory.ts`
4. Export from `src/providers/index.ts`

### Adding a New Notification Adapter

1. Create `src/adapters/notifications/your-adapter.ts`
2. Implement `sendMessage()` and convenience methods
3. Add config schema to `src/config/schema.ts`

### Creating a Plugin

1. Create a directory with `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "type": "tool",
  "main": "index.js"
}
```

2. Implement the plugin interface matching the type
3. Place in `.megasloth/plugins/` or publish to npm

## Testing

```bash
# Run all tests
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run specific test file
pnpm vitest run src/providers/factory.test.ts
```

## Code of Conduct

Be respectful, constructive, and inclusive. We're all here to build something great together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
