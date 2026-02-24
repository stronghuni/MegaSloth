#!/usr/bin/env bash
#
#   MegaSloth Installer
#   AI-Powered Repository Operations Agent
#
#   Usage:
#     curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
#
set -euo pipefail

# ─────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────
MEGASLOTH_REPO="https://github.com/stronghuni/MegaSloth.git"
MEGASLOTH_DIR="${MEGASLOTH_HOME:-$HOME/.megasloth-app}"
MEGASLOTH_BIN="/usr/local/bin/megasloth"
REQUIRED_NODE_MAJOR=22
MIN_NODE_MAJOR=20

# ─────────────────────────────────────────────────────
# Colors & UI
# ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║                                                      ║"
  echo "  ║          🦥  M E G A S L O T H                      ║"
  echo "  ║                                                      ║"
  echo "  ║    AI-Powered Repository Operations Agent            ║"
  echo "  ║                                                      ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
}

info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }
step()    { echo -e "\n  ${MAGENTA}${BOLD}[$1/$TOTAL_STEPS]${NC} ${WHITE}$2${NC}\n"; }
ask()     { echo -ne "  ${CYAN}?${NC} $1"; }

TOTAL_STEPS=8

# ─────────────────────────────────────────────────────
# OS Detection
# ─────────────────────────────────────────────────────
detect_os() {
  OS="unknown"
  ARCH="$(uname -m)"

  case "$(uname -s)" in
    Darwin)  OS="macos" ;;
    Linux)   OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  esac

  if [ "$OS" = "unknown" ]; then
    error "Unsupported operating system: $(uname -s)"
    echo ""
    echo "  MegaSloth supports: macOS, Linux, and Windows (WSL)"
    echo "  For Windows, install WSL first:"
    echo "    https://learn.microsoft.com/en-us/windows/wsl/install"
    echo ""
    exit 1
  fi
}

# ─────────────────────────────────────────────────────
# Dependency Checks
# ─────────────────────────────────────────────────────
check_command() {
  command -v "$1" &>/dev/null
}

get_node_version() {
  if check_command node; then
    node -v 2>/dev/null | sed 's/v//' | cut -d'.' -f1
  else
    echo "0"
  fi
}

install_node() {
  info "Node.js >= $REQUIRED_NODE_MAJOR is required"

  if [ "$OS" = "macos" ]; then
    if check_command brew; then
      info "Installing Node.js via Homebrew..."
      brew install node@$REQUIRED_NODE_MAJOR
      brew link --overwrite node@$REQUIRED_NODE_MAJOR 2>/dev/null || true
    else
      info "Installing Homebrew first..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Add Homebrew to PATH for Apple Silicon
      if [ -f "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      fi
      brew install node@$REQUIRED_NODE_MAJOR
      brew link --overwrite node@$REQUIRED_NODE_MAJOR 2>/dev/null || true
    fi
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      info "Installing Node.js via NodeSource (apt)..."
      curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif check_command dnf; then
      info "Installing Node.js via NodeSource (dnf)..."
      curl -fsSL https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo bash -
      sudo dnf install -y nodejs
    elif check_command yum; then
      info "Installing Node.js via NodeSource (yum)..."
      curl -fsSL https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo bash -
      sudo yum install -y nodejs
    elif check_command pacman; then
      info "Installing Node.js via pacman..."
      sudo pacman -Sy --noconfirm nodejs npm
    else
      error "Could not detect package manager."
      echo "  Please install Node.js >= $REQUIRED_NODE_MAJOR manually:"
      echo "    https://nodejs.org/en/download"
      exit 1
    fi
  fi
}

install_redis() {
  if [ "$OS" = "macos" ]; then
    if check_command brew; then
      info "Installing Redis via Homebrew..."
      brew install redis
      brew services start redis 2>/dev/null || true
    fi
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      info "Installing Redis via apt..."
      sudo apt-get install -y redis-server
      sudo systemctl enable redis-server 2>/dev/null || sudo service redis-server start 2>/dev/null || true
    elif check_command dnf; then
      sudo dnf install -y redis
      sudo systemctl enable --now redis 2>/dev/null || true
    elif check_command yum; then
      sudo yum install -y redis
      sudo systemctl enable --now redis 2>/dev/null || true
    elif check_command pacman; then
      sudo pacman -Sy --noconfirm redis
      sudo systemctl enable --now redis 2>/dev/null || true
    fi
  fi
}

install_pnpm() {
  if ! check_command pnpm; then
    info "Installing pnpm..."
    npm install -g pnpm@latest 2>/dev/null || sudo npm install -g pnpm@latest
    success "pnpm installed"
  fi
}

install_gh() {
  if check_command gh; then
    return 0
  fi

  info "Installing GitHub CLI (gh)..."
  if [ "$OS" = "macos" ]; then
    if check_command brew; then
      brew install gh
    else
      warn "Homebrew not available — skipping gh install"
      return 1
    fi
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      (type -p wget >/dev/null || sudo apt-get install -y wget) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt-get update && sudo apt-get install -y gh
    elif check_command dnf; then
      sudo dnf install -y 'dnf-command(config-manager)' && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo dnf install -y gh
    elif check_command yum; then
      sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo yum install -y gh
    elif check_command pacman; then
      sudo pacman -Sy --noconfirm github-cli
    else
      warn "Could not install gh CLI automatically"
      return 1
    fi
  fi

  if check_command gh; then
    success "GitHub CLI (gh) installed"
    return 0
  else
    warn "gh installation failed — GitHub token can still be set manually"
    return 1
  fi
}

# ─────────────────────────────────────────────────────
# Interactive Setup
# ─────────────────────────────────────────────────────
run_setup_wizard() {
  echo -e "\n  ${WHITE}${BOLD}── Setup Wizard ──${NC}\n"
  echo -e "  ${DIM}Configure your MegaSloth instance. Press Enter to skip optional fields.${NC}\n"

  # LLM Provider
  echo -e "  ${WHITE}Which AI provider would you like to use?${NC}"
  echo -e "  ${DIM}  1) Claude  (Anthropic) — recommended${NC}"
  echo -e "  ${DIM}  2) OpenAI  (GPT-4o)${NC}"
  echo -e "  ${DIM}  3) Gemini  (Google)${NC}"
  echo ""
  ask "Choose [1/2/3] (default: 1): "
  read -r llm_choice
  echo ""

  case "$llm_choice" in
    2) LLM_PROVIDER="openai" ;;
    3) LLM_PROVIDER="gemini" ;;
    *) LLM_PROVIDER="claude" ;;
  esac

  success "LLM Provider: ${BOLD}$LLM_PROVIDER${NC}"

  # API Key
  case "$LLM_PROVIDER" in
    claude)
      ask "Anthropic API Key (sk-ant-...): "
      read -rs api_key; echo ""
      API_KEY_VAR="ANTHROPIC_API_KEY"
      ;;
    openai)
      ask "OpenAI API Key (sk-...): "
      read -rs api_key; echo ""
      API_KEY_VAR="OPENAI_API_KEY"
      ;;
    gemini)
      ask "Google Gemini API Key (AIza...): "
      read -rs api_key; echo ""
      API_KEY_VAR="GEMINI_API_KEY"
      ;;
  esac

  if [ -n "${api_key:-}" ]; then
    success "API Key: ****${api_key: -4}"
  else
    warn "No API key provided — you can set it later in .env"
  fi

  # Security Profile
  echo ""
  echo -e "  ${WHITE}Security Profile:${NC}"
  echo -e "  ${DIM}  1) Standard — shell, filesystem, web, credentials (recommended)${NC}"
  echo -e "  ${DIM}  2) Full     — all tools including browser automation & system control${NC}"
  echo -e "  ${DIM}  3) Restricted — Git operations only, no local access${NC}"
  echo ""
  ask "Choose [1/2/3] (default: 1): "
  read -r sec_choice
  echo ""

  case "$sec_choice" in
    2) SECURITY_PROFILE="full" ;;
    3) SECURITY_PROFILE="restricted" ;;
    *) SECURITY_PROFILE="standard" ;;
  esac
  success "Security: ${BOLD}$SECURITY_PROFILE${NC}"

  # Auto-detect GitHub token
  github_token=""
  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    github_token=$(gh auth token 2>/dev/null || true)
    if [ -n "${github_token:-}" ]; then
      success "GitHub Token: auto-detected from gh CLI"
    fi
  fi

  if [ -z "${github_token:-}" ]; then
    echo ""
    echo -e "  ${DIM}GitHub token not found. MegaSloth can auto-provision later via OAuth.${NC}"
    ask "GitHub Personal Access Token (ghp_..., or Enter to skip): "
    read -rs github_token; echo ""
    if [ -n "${github_token:-}" ]; then
      success "GitHub Token: ****${github_token: -4}"
    else
      info "Will auto-provision GitHub token on first use (OAuth Device Flow)"
    fi
  fi

  webhook_secret=$(openssl rand -hex 20 2>/dev/null || head -c 40 /dev/urandom | od -A n -t x1 | tr -d ' \n')
  success "Webhook Secret: auto-generated"

  # Assign API keys based on provider
  local anthropic_key="" openai_key="" gemini_key=""
  case "$LLM_PROVIDER" in
    claude)  anthropic_key="${api_key:-}" ;;
    openai)  openai_key="${api_key:-}" ;;
    gemini)  gemini_key="${api_key:-}" ;;
  esac

  # Write .env
  cat > "$MEGASLOTH_DIR/.env" <<ENVEOF
# ═══════════════════════════════════════════════════════
#  MegaSloth Configuration
#  Generated by install.sh on $(date +%Y-%m-%d)
# ═══════════════════════════════════════════════════════

# LLM Provider: claude | openai | gemini
LLM_PROVIDER=${LLM_PROVIDER}

# API Keys (set the one matching your provider)
ANTHROPIC_API_KEY=${anthropic_key}
OPENAI_API_KEY=${openai_key}
GEMINI_API_KEY=${gemini_key}

# GitHub
GITHUB_TOKEN=${github_token:-}
GITHUB_WEBHOOK_SECRET=${webhook_secret}

# Server Ports
HTTP_PORT=13000
WEBHOOK_PORT=3001
WEBSOCKET_PORT=18789

# Redis
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=${MEGASLOTH_DIR}/.megasloth/data/megasloth.db

# Security Profile: restricted | standard | full
SECURITY_PROFILE=${SECURITY_PROFILE}

# Logging
LOG_LEVEL=info
ENVEOF

  # Fix the env file with proper values
  if [ "$LLM_PROVIDER" = "claude" ]; then
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=|" "$MEGASLOTH_DIR/.env"
  elif [ "$LLM_PROVIDER" = "openai" ]; then
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=|" "$MEGASLOTH_DIR/.env"
  elif [ "$LLM_PROVIDER" = "gemini" ]; then
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=|" "$MEGASLOTH_DIR/.env"
    sed -i.bak "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env" 2>/dev/null || \
    sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${api_key:-}|" "$MEGASLOTH_DIR/.env"
  fi

  # Clean up backup files from sed
  rm -f "$MEGASLOTH_DIR/.env.bak"
}

# ─────────────────────────────────────────────────────
# Main Installation Flow
# ─────────────────────────────────────────────────────
main() {
  print_banner
  detect_os

  info "Detected OS: ${BOLD}$OS${NC} (${ARCH})"
  echo ""

  # ── Step 1: Check Node.js ──
  step 1 "Checking Node.js"

  NODE_VERSION=$(get_node_version)
  if [ "$NODE_VERSION" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
    success "Node.js v$(node -v 2>/dev/null | sed 's/v//') found"
  else
    warn "Node.js >= $REQUIRED_NODE_MAJOR not found"
    ask "Install Node.js $REQUIRED_NODE_MAJOR automatically? [Y/n]: "
    read -r yn
    case "$yn" in
      [nN]*)
        error "Node.js is required. Install it from https://nodejs.org"
        exit 1
        ;;
      *)
        install_node
        success "Node.js installed: v$(node -v 2>/dev/null | sed 's/v//')"
        ;;
    esac
  fi

  install_pnpm

  # ── Step 2: Check Redis ──
  step 2 "Checking Redis"

  if check_command redis-server || check_command redis-cli; then
    success "Redis found"
    # Try to start if not running
    redis-cli ping &>/dev/null || {
      warn "Redis is installed but not running"
      if [ "$OS" = "macos" ]; then
        brew services start redis 2>/dev/null && success "Redis started" || warn "Start Redis manually: redis-server"
      else
        sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null || warn "Start Redis manually: redis-server"
      fi
    }
  else
    warn "Redis not found"
    ask "Install Redis automatically? [Y/n]: "
    read -r yn
    case "$yn" in
      [nN]*)
        warn "Redis is required for the job queue."
        warn "Install it later: https://redis.io/docs/install/"
        ;;
      *)
        install_redis
        success "Redis installed and started"
        ;;
    esac
  fi

  # ── Step 3: Check GitHub CLI ──
  step 3 "Checking GitHub CLI (gh)"

  if check_command gh; then
    success "GitHub CLI (gh) found: $(gh --version 2>/dev/null | head -1)"
    if gh auth status &>/dev/null 2>&1; then
      success "GitHub CLI: already authenticated"
    else
      info "GitHub CLI installed but not logged in"
      ask "Log in to GitHub now? [Y/n]: "
      read -r yn
      case "$yn" in
        [nN]*) info "You can log in later: gh auth login" ;;
        *)
          gh auth login --web 2>/dev/null || gh auth login || warn "Login skipped — run 'gh auth login' later"
          ;;
      esac
    fi
  else
    ask "Install GitHub CLI (gh) for automatic token management? [Y/n]: "
    read -r yn
    case "$yn" in
      [nN]*)
        info "Skipped — you can set GITHUB_TOKEN manually in .env later"
        ;;
      *)
        if install_gh; then
          ask "Log in to GitHub now? [Y/n]: "
          read -r yn2
          case "$yn2" in
            [nN]*) info "You can log in later: gh auth login" ;;
            *)
              gh auth login --web 2>/dev/null || gh auth login || warn "Login skipped"
              ;;
          esac
        fi
        ;;
    esac
  fi

  # ── Step 4: Download MegaSloth ──
  step 4 "Downloading MegaSloth"

  if [ -d "$MEGASLOTH_DIR" ]; then
    info "Existing installation found, updating..."
    cd "$MEGASLOTH_DIR"
    git pull origin main 2>/dev/null || {
      warn "Could not update, performing fresh install..."
      cd "$HOME"
      rm -rf "$MEGASLOTH_DIR"
      git clone --depth 1 "$MEGASLOTH_REPO" "$MEGASLOTH_DIR"
      cd "$MEGASLOTH_DIR"
    }
  else
    git clone --depth 1 "$MEGASLOTH_REPO" "$MEGASLOTH_DIR"
    cd "$MEGASLOTH_DIR"
  fi

  success "Downloaded to $MEGASLOTH_DIR"

  # ── Step 5: Install Dependencies & Build ──
  step 5 "Installing dependencies"

  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  success "Dependencies installed"

  info "Building MegaSloth..."
  pnpm build 2>/dev/null || {
    warn "TypeScript build skipped (will use tsx for dev mode)"
  }
  success "Build complete"

  # Create data directories
  mkdir -p .megasloth/data .megasloth/skills

  # ── Step 6: Setup Wizard ──
  step 6 "Configuration"

  if [ -t 0 ]; then
    # Interactive terminal
    run_setup_wizard
  else
    # Non-interactive (piped) — create default env
    warn "Non-interactive mode — creating default .env"
    cp .env.example .env 2>/dev/null || true
    info "Edit $MEGASLOTH_DIR/.env to configure your API keys"
  fi

  success "Configuration saved to $MEGASLOTH_DIR/.env"

  # ── Step 7: Create Global Command ──
  step 7 "Creating megasloth command"

  # Create wrapper script
  WRAPPER_SCRIPT=$(cat <<'WRAPPER'
#!/usr/bin/env bash
MEGASLOTH_DIR="INSTALL_DIR_PLACEHOLDER"

case "${1:-}" in
  start)
    echo ""
    echo "  🦥 Starting MegaSloth..."
    echo ""
    cd "$MEGASLOTH_DIR"
    if [ -f "dist/index.js" ]; then
      node dist/index.js
    else
      npx tsx src/index.ts
    fi
    ;;
  start:bg)
    echo ""
    echo "  🦥 Starting MegaSloth in background..."
    cd "$MEGASLOTH_DIR"
    if [ -f "dist/index.js" ]; then
      nohup node dist/index.js > .megasloth/data/megasloth.log 2>&1 &
    else
      nohup npx tsx src/index.ts > .megasloth/data/megasloth.log 2>&1 &
    fi
    echo $! > .megasloth/data/megasloth.pid
    echo "  ✓ MegaSloth running in background (PID: $!)"
    echo "  ✓ Logs: $MEGASLOTH_DIR/.megasloth/data/megasloth.log"
    echo ""
    ;;
  stop)
    PID_FILE="$MEGASLOTH_DIR/.megasloth/data/megasloth.pid"
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm -f "$PID_FILE"
        echo "  ✓ MegaSloth stopped (PID: $PID)"
      else
        rm -f "$PID_FILE"
        echo "  MegaSloth was not running"
      fi
    else
      echo "  MegaSloth is not running"
    fi
    ;;
  status)
    PID_FILE="$MEGASLOTH_DIR/.megasloth/data/megasloth.pid"
    echo ""
    echo "  🦥 MegaSloth Status"
    echo ""
    echo "  Install dir: $MEGASLOTH_DIR"
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "  Status:      ✓ Running (PID: $PID)"
      else
        echo "  Status:      ✗ Not running (stale PID)"
      fi
    else
      echo "  Status:      ✗ Not running"
    fi
    redis-cli ping &>/dev/null && echo "  Redis:       ✓ Connected" || echo "  Redis:       ✗ Not reachable"
    curl -sf http://localhost:13000/health &>/dev/null && echo "  HTTP API:    ✓ Healthy" || echo "  HTTP API:    ✗ Not reachable"
    echo ""
    ;;
  logs)
    LOG_FILE="$MEGASLOTH_DIR/.megasloth/data/megasloth.log"
    if [ -f "$LOG_FILE" ]; then
      tail -f "$LOG_FILE"
    else
      echo "  No log file found. Start MegaSloth first: megasloth start:bg"
    fi
    ;;
  config)
    "${EDITOR:-nano}" "$MEGASLOTH_DIR/.env"
    ;;
  update)
    echo "  🦥 Updating MegaSloth..."
    cd "$MEGASLOTH_DIR"
    git pull origin main
    pnpm install
    pnpm build 2>/dev/null || true
    echo "  ✓ MegaSloth updated!"
    ;;
  uninstall)
    echo ""
    echo "  ⚠  This will remove MegaSloth from your system."
    echo -n "  Are you sure? [y/N]: "
    read -r yn
    case "$yn" in
      [yY]*)
        rm -rf "$MEGASLOTH_DIR"
        rm -f "SELF_PATH_PLACEHOLDER"
        echo "  ✓ MegaSloth has been uninstalled."
        ;;
      *)
        echo "  Cancelled."
        ;;
    esac
    ;;
  help|--help|-h|"")
    echo ""
    echo "  🦥 MegaSloth - AI-Powered Repository Operations Agent"
    echo ""
    echo "  Usage: megasloth <command>"
    echo ""
    echo "  Commands:"
    echo "    start       Start MegaSloth (foreground)"
    echo "    start:bg    Start MegaSloth (background daemon)"
    echo "    stop        Stop background MegaSloth"
    echo "    status      Show current status"
    echo "    logs        Follow log output"
    echo "    config      Edit configuration (.env)"
    echo "    update      Update to latest version"
    echo "    uninstall   Remove MegaSloth"
    echo "    help        Show this help message"
    echo ""
    echo "  Docs: https://github.com/stronghuni/MegaSloth"
    echo ""
    ;;
  *)
    echo "  Unknown command: $1"
    echo "  Run 'megasloth help' for usage"
    exit 1
    ;;
esac
WRAPPER
  )

  # Replace placeholders
  WRAPPER_SCRIPT="${WRAPPER_SCRIPT//INSTALL_DIR_PLACEHOLDER/$MEGASLOTH_DIR}"

  # Determine install path
  if [ -w "/usr/local/bin" ]; then
    INSTALL_BIN="/usr/local/bin/megasloth"
  elif [ -d "$HOME/.local/bin" ]; then
    INSTALL_BIN="$HOME/.local/bin/megasloth"
  else
    mkdir -p "$HOME/.local/bin"
    INSTALL_BIN="$HOME/.local/bin/megasloth"
  fi

  WRAPPER_SCRIPT="${WRAPPER_SCRIPT//SELF_PATH_PLACEHOLDER/$INSTALL_BIN}"

  echo "$WRAPPER_SCRIPT" > "$INSTALL_BIN"
  chmod +x "$INSTALL_BIN"
  success "Command installed: $INSTALL_BIN"

  # Check if bin is in PATH
  if ! echo "$PATH" | grep -q "$(dirname "$INSTALL_BIN")"; then
    warn "$(dirname "$INSTALL_BIN") is not in your PATH"

    SHELL_RC=""
    case "$SHELL" in
      */zsh)  SHELL_RC="$HOME/.zshrc" ;;
      */bash) SHELL_RC="$HOME/.bashrc" ;;
      */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
    esac

    if [ -n "$SHELL_RC" ]; then
      echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
      info "Added to $SHELL_RC — restart your terminal or run:"
      echo -e "    ${DIM}source $SHELL_RC${NC}"
    fi
  fi

  # ── Step 8: Auto-Provision Credentials ──
  step 8 "Auto-provisioning credentials"

  if [ -n "${github_token:-}" ]; then
    success "GitHub: already configured"
  else
    if command -v gh &>/dev/null; then
      info "Attempting GitHub login via gh CLI..."
      if gh auth login --web 2>/dev/null; then
        github_token=$(gh auth token 2>/dev/null || true)
        if [ -n "${github_token:-}" ]; then
          # Update .env with new token
          if [ "$(uname -s)" = "Darwin" ]; then
            sed -i '' "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${github_token}|" "$MEGASLOTH_DIR/.env"
          else
            sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${github_token}|" "$MEGASLOTH_DIR/.env"
          fi
          success "GitHub: token provisioned via gh CLI"
        fi
      else
        info "GitHub: will auto-provision on first use via OAuth Device Flow"
      fi
    else
      info "GitHub: install 'gh' CLI for easy auth, or set GITHUB_TOKEN in .env"
    fi
  fi

  # Check other CLIs
  if command -v glab &>/dev/null && glab auth status &>/dev/null 2>&1; then
    success "GitLab: CLI detected and authenticated"
  fi
  if command -v aws &>/dev/null && aws sts get-caller-identity &>/dev/null 2>&1; then
    success "AWS: CLI configured"
  fi
  if command -v gcloud &>/dev/null && gcloud auth print-access-token &>/dev/null 2>&1; then
    success "GCP: CLI configured"
  fi

  info "All missing credentials will be auto-provisioned on demand"

  # ── Done! ──
  echo ""
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}${BOLD}  🦥  MegaSloth installed successfully!${NC}"
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${WHITE}Quick Start:${NC}"
  echo ""
  echo -e "    ${CYAN}megasloth start${NC}       Start in foreground"
  echo -e "    ${CYAN}megasloth start:bg${NC}    Start as background daemon"
  echo -e "    ${CYAN}megasloth status${NC}      Check if running"
  echo -e "    ${CYAN}megasloth config${NC}      Edit configuration"
  echo -e "    ${CYAN}megasloth logs${NC}        View live logs"
  echo -e "    ${CYAN}megasloth help${NC}        Show all commands"
  echo ""
  echo -e "  ${WHITE}Webhook URLs (configure in your Git platform):${NC}"
  echo ""
  echo -e "    GitHub:    ${DIM}https://your-server:3001/webhook/github${NC}"
  echo -e "    GitLab:    ${DIM}https://your-server:3001/webhook/gitlab${NC}"
  echo -e "    Bitbucket: ${DIM}https://your-server:3001/webhook/bitbucket${NC}"
  echo ""
  echo -e "  ${WHITE}Docs:${NC} ${BLUE}https://github.com/stronghuni/MegaSloth${NC}"
  echo ""
}

main "$@"
