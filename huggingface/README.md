---
title: MegaSloth - AI DevOps Agent
emoji: 🦥
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 4.19.0
app_file: app.py
pinned: false
license: mit
---

# MegaSloth - AI-Powered DevOps Automation Agent

**Self-hosted AI agent that monitors GitHub, GitLab, and Bitbucket repositories 24/7 and autonomously handles DevOps tasks.**

## 🚀 Try the Demo

This Space provides a demo interface to chat with MegaSloth and learn about its capabilities.

For full functionality, install MegaSloth locally on your infrastructure.

## ✨ Features

### Automated PR Reviews
- Context-aware code review with AI
- Security vulnerability detection
- Code quality suggestions
- Auto-fix capabilities

### CI/CD Management
- Diagnose build failures
- Propose and apply fixes
- Monitor pipeline health

### Issue Triage
- Smart labeling and categorization
- Priority assignment
- Initial response generation

### Dependency Management
- Automated dependency updates
- Security patch detection
- Compatibility checking

### Documentation Sync
- Keep docs in sync with code
- Generate API documentation
- Update README files

### Test Generation
- Generate tests for new code
- Coverage improvement suggestions
- Edge case detection

### Release Automation
- Semantic versioning
- Changelog generation
- Git tag management

### Repository Health
- Weekly health reports
- Actionable insights
- Trend analysis

## 🛠️ Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 22
- **LLMs**: Claude (Anthropic), GPT-5.2 (OpenAI), Gemini 2.5 (Google)
- **Tools**: 84 built-in tools across 9 categories
- **Queue**: BullMQ with Redis
- **Database**: SQLite (Drizzle ORM)
- **Desktop**: Electron
- **Platforms**: GitHub, GitLab, Bitbucket

## 📦 Installation

### One-Line Install (macOS/Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
```

### NPM (CLI)
```bash
npm install -g megasloth
megasloth init
megasloth start
```

### Desktop App
Download from [GitHub Releases](https://github.com/stronghuni/MegaSloth/releases):
- macOS (Apple Silicon / Intel)
- Windows
- Linux (AppImage)

## 🏗️ Architecture

```
Webhooks (GitHub/GitLab/Bitbucket)
 ↓
Gateway Layer (HTTP + WebSocket)
 ↓
Job Queue (BullMQ + Redis)
 ↓
Skill Engine (matches events → SKILL.md)
 ↓
Agent Core (LLM loop with tool execution)
 ↓
84 Tools (shell, browser, filesystem, web, git, ci/cd, memory, credentials, local)
```

## 🔒 Self-Hosted & Private

- Your code never leaves your infrastructure
- Full control over data and behavior
- Works with GitHub Enterprise / GitLab self-hosted
- No data sent to third parties (except LLM API)

## 📚 Documentation

- [Full Documentation](https://github.com/stronghuni/MegaSloth#readme)
- [Quick Start Guide](https://github.com/stronghuni/MegaSloth#-quick-start-guide)
- [Configuration](https://github.com/stronghuni/MegaSloth#%EF%B8%8F-configuration)
- [Skills System](https://github.com/stronghuni/MegaSloth#-skills)
- [API Reference](https://github.com/stronghuni/MegaSloth#-api)

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/stronghuni/MegaSloth/blob/main/CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](https://github.com/stronghuni/MegaSloth/blob/main/LICENSE)

## 🔗 Links

- **GitHub**: https://github.com/stronghuni/MegaSloth
- **Issues**: https://github.com/stronghuni/MegaSloth/issues
- **NPM**: https://www.npmjs.com/package/megasloth

---

**Note**: This is a demo interface. For production use, install MegaSloth on your own infrastructure where it can securely connect to your repositories.
