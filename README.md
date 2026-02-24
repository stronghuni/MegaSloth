<p align="center">
  <img src="logo.png" alt="MegaSloth" width="800" />
</p>

<h1 align="center">🦥 MegaSloth</h1>

<p align="center">
  <em>Slow is smooth, smooth is fast.</em>
</p>

<p align="center">
  <strong>AI-Powered Full Automation Agent — One API Key, Total Control</strong><br/>
  Shell, Browser, Filesystem, Web, Git, CI/CD, Credentials — all automated by AI
</p>

<p align="center">
  <a href="#-one-line-install">Install</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-quick-start-guide">Quick Start</a> &bull;
  <a href="#%EF%B8%8F-configuration">Configuration</a> &bull;
  <a href="#-skills">Skills</a> &bull;
  <a href="#-commands">Commands</a> &bull;
  <a href="#-docker">Docker</a> &bull;
  <a href="#-api">API</a> &bull;
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-green?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
  <img src="https://img.shields.io/badge/LLM-Claude%20%7C%20OpenAI%20%7C%20Gemini-purple" alt="LLM" />
  <img src="https://img.shields.io/badge/Git-GitHub%20%7C%20GitLab%20%7C%20Bitbucket-orange" alt="Git Platforms" />
</p>

---

## 🚀 Quick Start

### Desktop App — Download & Install

> No terminal. No coding. Just download, install, and configure your API key in the app.

| Platform | Download |
|----------|----------|
| **macOS (Apple Silicon)** | [MegaSloth-arm64.dmg](https://github.com/stronghuni/MegaSloth/releases/latest/download/MegaSloth-arm64.dmg) |
| **macOS (Intel)** | [MegaSloth-x64.dmg](https://github.com/stronghuni/MegaSloth/releases/latest/download/MegaSloth-x64.dmg) |
| **Windows** | [MegaSloth-Setup.exe](https://github.com/stronghuni/MegaSloth/releases/latest/download/MegaSloth-Setup.exe) |
| **Linux** | [MegaSloth.AppImage](https://github.com/stronghuni/MegaSloth/releases/latest/download/MegaSloth.AppImage) |

Or install via terminal:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.ps1 | iex
```

**That's it.** Open the app → go to **Settings** → enter your API key. Done.

---

### CLI — For Developers

> Terminal-based. Requires Node.js >= 22.

```bash
npm install -g megasloth
```

```bash
megasloth init      # Initialize in current directory
megasloth start     # Start the agent
megasloth status    # Check status
```

---

## 💡 What is MegaSloth?

MegaSloth is a **self-hosted AI agent** that monitors your Git repositories 24/7 and autonomously handles repetitive DevOps tasks. It connects to GitHub, GitLab, and Bitbucket, listens for events via webhooks, and uses AI (Claude, OpenAI, or Gemini) to intelligently automate:

- **PR Code Review** with auto-fix suggestions
- **CI/CD Failure Diagnosis** and automated repair
- **Issue Triage** with smart labeling and prioritization
- **Dependency Updates** with automated PRs
- **Documentation Sync** when code changes
- **Test Generation** for new code
- **Release Automation** with changelog generation
- **Repository Health Reports**

> _"Slow is smooth, smooth is fast."_ — MegaSloth takes its time to get things right.

---

## ✨ Features

### Multi-Platform Git Support
| Platform | PRs | Issues | CI/CD | Releases | Webhooks |
|----------|-----|--------|-------|----------|----------|
| GitHub | Full | Full | Full | Full | Full |
| GitLab | Full | Full | Full | Full | Full |
| Bitbucket | Full | Partial | Full | Tags | Full |

### Multi-Model LLM Support (2026 Latest)
Choose your preferred AI provider — **bring your own API key**:

| Provider | Models | Default | Status |
|----------|--------|---------|--------|
| **Anthropic Claude** | Opus 4.6, Sonnet 4.6, Haiku 4.5 | claude-sonnet-4-6-20260217 | Supported |
| **OpenAI** | GPT-5.2, GPT-5.2 Instant, GPT-5.3 Codex | gpt-5.2 | Supported |
| **Google Gemini** | Gemini 3.1 Pro, Gemini 3.0 Flash | gemini-3.1-pro | Supported |

### 105 Built-in Tools (9 Categories + Jenkins/K8s/Helm)

MegaSloth is a **full automation agent** with tools spanning every layer of your system:

| Category | Tools | Description |
|----------|-------|-------------|
| **Shell** (6) | `shell_exec`, `shell_background`, `process_list/poll/kill/write` | Execute commands, manage background processes |
| **Filesystem** (7) | `fs_read/write/edit/list/delete/search/info` | Full local file access with edit-in-place |
| **Web** (3) | `web_search`, `web_fetch`, `web_screenshot` | DuckDuckGo search, readable page extraction, screenshots |
| **Browser** (10) | `browser_launch/navigate/click/type/screenshot/snapshot/scroll/evaluate/wait/tabs` | Playwright-based full browser automation |
| **System** (5) | `system_screenshot`, `clipboard_read/write`, `notify`, `open` | OS-level control (macOS/Linux/Windows) |
| **Git/CI/CD** (30+) | PRs, issues, branches, workflows, deployments, releases, env vars, secrets | Full GitHub/GitLab/Bitbucket control |
| **Credential** (4) | `credential_provision/list/store/delete` | Auto-provisioning via OAuth Device Flow + encrypted vault |
| **Memory** (4) | `memory_store/search/list/delete` | Persistent context across sessions |
| **Session** (3) | `session_spawn/list/send` | Multi-agent background task management |

### Auto-Credential Provisioning

MegaSloth automatically obtains and manages API tokens:

- **GitHub** — gh CLI detection → OAuth Device Flow → manual fallback
- **GitLab** — glab CLI detection → manual fallback
- **AWS** — aws CLI detection → SSO login guide
- **GCP** — gcloud CLI detection → auth guide
- All credentials encrypted with **AES-256-GCM** in a local vault

### Security Profiles

| Profile | Description | Tools Enabled |
|---------|-------------|---------------|
| **Restricted** | Git operations only | Git, PR, CI, Issue, Code, Memory |
| **Standard** | Full dev workflow | + Shell, Filesystem, Web, Credentials |
| **Full** | Complete automation | + Browser, System (all 84 tools) |

### 8 Built-in Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| **PR Review** | PR opened/updated | AI code review with severity classification and auto-fix PRs |
| **CI Fix** | CI failure | Analyzes logs, diagnoses root cause, creates fix PR |
| **Issue Triage** | Issue opened | Auto-labels, prioritizes, and responds to issues |
| **Dep Update** | Weekly cron | Scans dependencies, creates update PRs |
| **Doc Sync** | Push to main | Keeps README/docs in sync with code changes |
| **Test Gen** | PR with new code | Generates test cases for untested code |
| **Repo Health** | Weekly cron | Comprehensive repository health report |
| **Release Auto** | Manual/cron | Auto-changelog, version bump, release creation |

### Plugin System
Extend MegaSloth with custom plugins:
- **Tool Plugins** — Add new tools (Jira, Notion, etc.)
- **Skill Plugins** — Add custom automation skills
- **Provider Plugins** — Add new LLM providers (Ollama, Bedrock)
- **Notification Plugins** — Add alert channels
- **Adapter Plugins** — Add new Git platforms (Gitea, Azure DevOps)

---

## 📖 Detailed Setup Guide

### Desktop App (Non-Developers)

**Step 1:** Download the installer from [GitHub Releases](https://github.com/stronghuni/MegaSloth/releases/latest)

| Platform | File |
|----------|------|
| **macOS (Apple Silicon)** | `MegaSloth-arm64.dmg` |
| **macOS (Intel)** | `MegaSloth-x64.dmg` |
| **Windows** | `MegaSloth-Setup.exe` |
| **Linux** | `MegaSloth.AppImage` |

**Step 2:** Install

| Platform | How to Install |
|----------|----------------|
| **macOS** | Open the `.dmg`, drag MegaSloth to Applications |
| **Windows** | Run the `.exe` installer |
| **Linux** | `chmod +x MegaSloth.AppImage && ./MegaSloth.AppImage` |

**Step 3:** Open the app → **Settings** → enter your API key

> **That's it.** No terminal required. The app handles everything.

---

### CLI (Developers)

```bash
npm install -g megasloth
megasloth init          # Initialize in current directory
# Edit .env with your API keys
megasloth start         # Start the agent
```

**Optional:** Set up webhooks in your GitHub repository

Go to your repository → **Settings** → **Webhooks** → **Add webhook**:
- **Payload URL:** `https://your-server-ip:3001/webhook/github`
- **Content type:** `application/json`
- **Secret:** (the secret shown during setup)
- **Events:** Select "Send me everything" or choose specific events

---

### Getting API Keys

<details>
<summary><b>🔑 Claude (Anthropic) API Key</b></summary>

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Go to **API Keys** in the sidebar
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

</details>

<details>
<summary><b>🔑 OpenAI API Key</b></summary>

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Go to **API Keys** in the sidebar
4. Click **Create new secret key**
5. Copy the key (starts with `sk-`)

</details>

<details>
<summary><b>🔑 Google Gemini API Key</b></summary>

1. Go to [aistudio.google.com](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click **Get API Key** in the sidebar
4. Click **Create API Key**
5. Copy the key (starts with `AIza`)

</details>

<details>
<summary><b>🔑 GitHub Personal Access Token</b></summary>

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token** → **Fine-grained token**
3. Set a name (e.g., "MegaSloth")
4. Select repositories to monitor
5. Under **Permissions**, enable:
   - **Contents:** Read and write
   - **Issues:** Read and write
   - **Pull requests:** Read and write
   - **Workflows:** Read and write
   - **Environments:** Read and write
   - **Deployments:** Read and write
6. Click **Generate token**
7. Copy the token (starts with `github_pat_` or `ghp_`)

</details>

---

### Developer Installation Options

#### npm (Recommended)

```bash
npm install -g megasloth
megasloth init && megasloth start
```

#### From Source

```bash
git clone https://github.com/stronghuni/MegaSloth.git
cd MegaSloth
pnpm install
cp .env.example .env    # Edit with your API keys
pnpm dev                # Development mode with hot reload
```

#### Docker

```bash
git clone https://github.com/stronghuni/MegaSloth.git
cd MegaSloth
cp .env.example .env    # Edit with your API keys
docker compose up -d
```

---

## 🎮 Commands

After installation, use the `megasloth` command:

| Command | Description |
|---------|-------------|
| `megasloth start` | Start MegaSloth in the foreground |
| `megasloth start:bg` | Start as a background daemon |
| `megasloth stop` | Stop the background daemon |
| `megasloth status` | Show running status, Redis connection, API health |
| `megasloth logs` | Follow live log output |
| `megasloth config` | Open configuration file in your editor |
| `megasloth update` | Pull latest version and rebuild |
| `megasloth uninstall` | Completely remove MegaSloth |
| `megasloth help` | Show all available commands |

---

## ⚙️ Configuration

MegaSloth supports configuration via **environment variables** (`.env`), **YAML config file**, or both.

### Edit Configuration

```bash
megasloth config
```

This opens your `.env` file in your default text editor.

### Config File (`.megasloth/config.yaml`)

```yaml
server:
  httpPort: 13000
  webhookPort: 3001
  websocketPort: 18789

llm:
  provider: claude          # claude | openai | gemini
  model: claude-sonnet-4-6-20260217
  maxTokens: 8192

github:
  token: ghp_xxxxx
  webhookSecret: your_secret

gitlab:
  token: glpat-xxxxx
  url: https://gitlab.com
  webhookSecret: your_secret

bitbucket:
  username: your_username
  appPassword: your_app_password

slack:
  botToken: xoxb-xxxxx
  defaultChannel: dev-alerts

database:
  url: .megasloth/data/megasloth.db

redis:
  url: redis://localhost:6379

logging:
  level: info   # trace | debug | info | warn | error
  pretty: true
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM provider to use | `claude` |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `LLM_MODEL` | Model name override | Provider default |
| `LLM_MAX_TOKENS` | Max tokens per request | `8192` |
| `JENKINS_URL` | Jenkins server URL | — |
| `JENKINS_USER` | Jenkins username | `admin` |
| `JENKINS_TOKEN` | Jenkins API token | — |
| `HTTP_PORT` | HTTP API port | `13000` |
| `WEBHOOK_PORT` | Webhook listener port | `3001` |
| `WEBSOCKET_PORT` | WebSocket port | `18789` |
| `DATABASE_URL` | SQLite database path | `.megasloth/data/megasloth.db` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `GITHUB_TOKEN` | GitHub personal access token | — |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | — |
| `GITLAB_TOKEN` | GitLab personal access token | — |
| `GITLAB_URL` | GitLab instance URL | `https://gitlab.com` |
| `GITLAB_WEBHOOK_SECRET` | GitLab webhook secret | — |
| `BITBUCKET_USERNAME` | Bitbucket username | — |
| `BITBUCKET_APP_PASSWORD` | Bitbucket app password | — |
| `SLACK_BOT_TOKEN` | Slack bot token | — |
| `SLACK_DEFAULT_CHANNEL` | Default Slack channel | `general` |
| `LOG_LEVEL` | Logging level | `info` |

---

## 🧠 Skills

### How Skills Work

Skills are markdown files (`SKILL.md`) with YAML frontmatter that define automation behaviors. Think of them as "recipes" that tell MegaSloth what to do when events happen.

```markdown
---
name: my-custom-skill
description: Does something awesome
version: 1.0.0
triggers:
  - type: webhook
    events:
      - pull_request.opened
      - pull_request.synchronize
  - type: cron
    schedule: "0 9 * * 1"  # Every Monday 9am
tools:
  - pr
  - code
  - git
  - ci
---

You are a code review assistant. When a PR is opened, review the code
for bugs, security issues, and best practices. Provide actionable feedback.
```

### Built-in Skills

Skills are loaded from two directories:
1. `src/skills/builtin/` — Built-in skills (shipped with MegaSloth)
2. `.megasloth/skills/` — Custom user skills

### Creating Custom Skills

1. Create a directory:

```bash
mkdir -p ~/.megasloth-app/.megasloth/skills/my-skill
```

2. Create `SKILL.md`:

```markdown
---
name: security-scan
description: Scans PRs for security vulnerabilities
triggers:
  - type: webhook
    events:
      - pull_request.opened
tools:
  - pr
  - code
---

You are a security expert. Analyze the PR diff for:
1. SQL injection vulnerabilities
2. XSS vulnerabilities
3. Hardcoded secrets or credentials
4. Insecure dependencies

Report findings as PR comments with severity levels.
```

3. Restart MegaSloth — the skill will be auto-discovered.

---

## 🐳 Docker

### Docker Compose (Recommended)

```bash
git clone https://github.com/stronghuni/MegaSloth.git
cd MegaSloth
cp .env.example .env   # Edit with your API keys
docker compose up -d
```

```yaml
# docker-compose.yml (included in repo)
services:
  megasloth:
    build: .
    ports:
      - "13000:13000"
      - "3001:3001"
      - "18789:18789"
    environment:
      - LLM_PROVIDER=claude
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - REDIS_URL=redis://redis:6379
    volumes:
      - megasloth-data:/app/.megasloth
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  megasloth-data:
  redis-data:
```

### Standalone Docker

```bash
docker build -t megasloth .
docker run -d \
  --name megasloth \
  -p 13000:13000 \
  -p 3001:3001 \
  -p 18789:18789 \
  -e LLM_PROVIDER=claude \
  -e ANTHROPIC_API_KEY=your_key \
  -e GITHUB_TOKEN=your_token \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  megasloth
```

---

## 📡 API

### REST API (default port 13000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api` | API info |
| `GET` | `/api/repositories` | List monitored repositories |
| `POST` | `/api/repositories` | Add a repository |
| `GET` | `/api/repositories/:id` | Get repository details |
| `GET` | `/api/repositories/:id/pull-requests` | List open PRs |
| `GET` | `/api/events` | List agent events |
| `GET` | `/api/jobs` | List scheduled jobs |
| `GET` | `/api/stats` | Agent statistics |
| `GET` | `/api/config` | Current config (keys masked) |
| `PUT` | `/api/config` | Update config |
| `GET` | `/api/skills` | List all skills |
| `PUT` | `/api/skills/:name/toggle` | Enable/disable skill |
| `GET` | `/api/providers` | List configured LLM providers |
| `POST` | `/api/providers/test` | Test API key validity |

### WebSocket (default port 18789)

Connect to `ws://your-server:18789/ws` for real-time events:

```javascript
const ws = new WebSocket('ws://localhost:18789/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data.payload);
};

// Event types:
// - webhook_received
// - agent_event
// - pr_reviewed
// - job_completed
```

### Webhook Endpoints (default port 3001)

| Platform | Endpoint |
|----------|----------|
| GitHub | `POST /webhook/github` |
| GitLab | `POST /webhook/gitlab` |
| Bitbucket | `POST /webhook/bitbucket` |

---

## 🔧 Tool Reference

MegaSloth's AI agent has access to **40+ tools** organized by category:

<details>
<summary><b>Git Tools</b></summary>

| Tool | Description |
|------|-------------|
| `git_diff` | Get diff between branches |
| `list_branches` | List repository branches |
| `delete_branch` | Delete a branch |
| `create_branch` | Create a new branch from ref |
| `create_pull_request` | Create a new PR |
| `merge_pull_request` | Merge a PR |

</details>

<details>
<summary><b>PR Tools</b></summary>

| Tool | Description |
|------|-------------|
| `get_pr_details` | Get PR metadata |
| `get_pr_files` | List changed files in PR |
| `add_pr_comment` | Add comment to PR |
| `add_line_comment` | Comment on specific line |
| `approve_pr` | Approve a PR |
| `request_changes` | Request changes on PR |

</details>

<details>
<summary><b>CI/CD Tools</b></summary>

| Tool | Description |
|------|-------------|
| `get_ci_status` | Get workflow run status |
| `get_workflow_jobs` | List jobs in a run |
| `get_job_logs` | Get job output logs |
| `retry_workflow` | Retry a failed run |
| `cancel_workflow` | Cancel a running workflow |
| `list_workflows` | List all workflows |
| `get_workflow_config` | Read workflow YAML |
| `trigger_workflow` | Manually trigger a workflow |

</details>

<details>
<summary><b>Code Tools</b></summary>

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents from repo |
| `list_files` | List directory contents |
| `create_file` | Create a new file in repo |
| `update_file` | Update existing file |
| `delete_file` | Delete a file |
| `search_code` | Search code in repository |

</details>

<details>
<summary><b>Environment & Deploy Tools</b></summary>

| Tool | Description |
|------|-------------|
| `list_environments` | List deployment environments |
| `get_env_variables` | Get environment variables |
| `set_env_variable` | Set an environment variable |
| `delete_env_variable` | Delete an environment variable |
| `get_repo_variables` | Get repository-level variables |
| `set_repo_variable` | Set a repository variable |
| `list_deployments` | List deployments |
| `create_deployment` | Create a new deployment |
| `get_deployment_status` | Get deployment status |

</details>

<details>
<summary><b>Issue & Release Tools</b></summary>

| Tool | Description |
|------|-------------|
| `list_issues` | List repository issues |
| `create_issue` | Create a new issue |
| `add_issue_comment` | Add comment to issue |
| `update_issue` | Update issue details |
| `close_issue` | Close an issue |
| `list_releases` | List releases |
| `create_release` | Create a new release |

</details>

---

## 🏗 Architecture

```
     User Chat / Webhooks (GitHub/GitLab/Bitbucket)
                         │
              ┌──────────┴──────────┐
              │  Gateway Layer      │  HTTP :13000 / Webhook :3001 / WebSocket
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  Job Queue + Cron   │  BullMQ + Redis + Croner
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │   Skill Engine      │  Match events → skills
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │    Agent Core       │  Multi-turn LLM loop
              │    + LLM Router     │  Claude / OpenAI / Gemini
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
  ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
  │ Git Tools   │ │ Local Tools │ │ Auto Creds  │
  │ (30+ tools) │ │ (31 tools)  │ │ + Vault     │
  │ GitHub      │ │ Shell       │ │ OAuth Flow  │
  │ GitLab      │ │ Filesystem  │ │ CLI detect  │
  │ Bitbucket   │ │ Web/Browser │ │ AES-256     │
  │ CI/CD       │ │ System      │ │ Auto-renew  │
  └─────────────┘ └─────────────┘ └─────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
              ┌──────────┴──────────┐
              │  Memory + Sessions  │  Persistent context + multi-agent
              │  Security Layer     │  Profile-based access control
              └─────────────────────┘
```

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork and clone
git clone https://github.com/your-username/MegaSloth.git
cd MegaSloth
pnpm install

# Create a feature branch
git checkout -b feature/my-awesome-feature

# Run tests
pnpm test

# Lint
pnpm lint

# Submit a PR
```

---

## ❓ Troubleshooting

<details>
<summary><b>Redis connection refused</b></summary>

Make sure Redis is running:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Or run directly
redis-server
```

</details>

<details>
<summary><b>Node.js version too old</b></summary>

MegaSloth requires Node.js >= 22. Update:
```bash
# macOS
brew install node@22

# Linux (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
winget install OpenJS.NodeJS.LTS
```

</details>

<details>
<summary><b>Windows: PowerShell script execution blocked</b></summary>

If you see "running scripts is disabled on this system":
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then re-run the installer:
```powershell
irm https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.ps1 | iex
```

</details>

<details>
<summary><b>Webhook not receiving events</b></summary>

1. Make sure your server is publicly accessible (use [ngrok](https://ngrok.com) for local testing)
2. Check the webhook URL is correct: `https://your-server:3001/webhook/github`
3. Verify the webhook secret matches your configuration
4. Check `megasloth logs` for incoming webhook events

</details>

<details>
<summary><b>API key not working</b></summary>

1. Check the key is correctly set: `megasloth config`
2. Make sure you're using the right provider: `LLM_PROVIDER=claude` with `ANTHROPIC_API_KEY`
3. Verify the key has sufficient credits/quota on the provider's dashboard

</details>

---

## 📄 License

[MIT](LICENSE) &copy; 2026 MegaSloth Contributors

---

<p align="center">
  <sub>Built with patience by 🦥 MegaSloth</sub>
</p>
