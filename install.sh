#!/usr/bin/env bash
#
#   MegaSloth Installer
#   Full Automation Agent — One API Key, Total Control
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
  echo "  ║    Full Automation Agent                              ║"
  echo "  ║    One API Key, Total Control                         ║"
  echo "  ║                                                      ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }
step()    { echo -e "\n  ${MAGENTA}${BOLD}[$1/$TOTAL_STEPS]${NC} ${WHITE}$2${NC}\n"; }
ask()     { echo -ne "  ${CYAN}?${NC} $1"; }

TOTAL_STEPS=5

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
    exit 1
  fi
}

# ─────────────────────────────────────────────────────
# Silent Dependency Installers (no user interaction)
# ─────────────────────────────────────────────────────
check_command() { command -v "$1" &>/dev/null; }

get_node_version() {
  if check_command node; then
    node -v 2>/dev/null | sed 's/v//' | cut -d'.' -f1
  else
    echo "0"
  fi
}

auto_install_node() {
  if [ "$OS" = "macos" ]; then
    if ! check_command brew; then
      info "Installing Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null
      [ -f "/opt/homebrew/bin/brew" ] && eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    brew install node@$REQUIRED_NODE_MAJOR 2>/dev/null
    brew link --overwrite node@$REQUIRED_NODE_MAJOR 2>/dev/null || true
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif check_command dnf; then
      curl -fsSL https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo bash -
      sudo dnf install -y nodejs
    elif check_command yum; then
      curl -fsSL https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | sudo bash -
      sudo yum install -y nodejs
    elif check_command pacman; then
      sudo pacman -Sy --noconfirm nodejs npm
    fi
  fi
}

auto_install_redis() {
  if [ "$OS" = "macos" ]; then
    check_command brew && brew install redis 2>/dev/null && brew services start redis 2>/dev/null || true
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      sudo apt-get install -y redis-server 2>/dev/null
      sudo systemctl enable redis-server 2>/dev/null || sudo service redis-server start 2>/dev/null || true
    elif check_command dnf; then
      sudo dnf install -y redis 2>/dev/null && sudo systemctl enable --now redis 2>/dev/null || true
    elif check_command pacman; then
      sudo pacman -Sy --noconfirm redis 2>/dev/null && sudo systemctl enable --now redis 2>/dev/null || true
    fi
  fi
}

auto_install_pnpm() {
  if ! check_command pnpm; then
    npm install -g pnpm@latest 2>/dev/null || sudo npm install -g pnpm@latest
  fi
}

auto_install_gh() {
  if [ "$OS" = "macos" ]; then
    check_command brew && brew install gh 2>/dev/null || true
  elif [ "$OS" = "linux" ]; then
    if check_command apt-get; then
      (type -p wget >/dev/null || sudo apt-get install -y wget) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt-get update && sudo apt-get install -y gh
    elif check_command dnf; then
      sudo dnf install -y 'dnf-command(config-manager)' 2>/dev/null && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo 2>/dev/null && sudo dnf install -y gh 2>/dev/null || true
    elif check_command pacman; then
      sudo pacman -Sy --noconfirm github-cli 2>/dev/null || true
    fi
  fi
}

# ─────────────────────────────────────────────────────
# Main Installation Flow
# ─────────────────────────────────────────────────────
main() {
  print_banner
  detect_os

  info "Detected: ${BOLD}$OS${NC} (${ARCH})"
  echo ""

  # ═══════════════════════════════════════════════════
  # STEP 1: Terms of Service
  # ═══════════════════════════════════════════════════
  step 1 "Terms of Service"

  echo -e "  ${WHITE}MegaSloth Full Automation Agent${NC}"
  echo ""
  echo -e "  By installing MegaSloth, you agree to the following:"
  echo ""
  echo -e "  ${DIM}  1. MegaSloth will have full access to your local system"
  echo -e "     including terminal, filesystem, browser, and clipboard.${NC}"
  echo ""
  echo -e "  ${DIM}  2. MegaSloth will automatically provision and manage"
  echo -e "     API credentials (GitHub, GitLab, AWS, GCP, etc.)${NC}"
  echo ""
  echo -e "  ${DIM}  3. MegaSloth will execute shell commands, modify files,"
  echo -e "     and interact with external services on your behalf.${NC}"
  echo ""
  echo -e "  ${DIM}  4. All credentials are encrypted (AES-256-GCM) and"
  echo -e "     stored locally. Nothing is sent to third parties.${NC}"
  echo ""
  echo -e "  ${DIM}  5. You can revoke permissions anytime by changing"
  echo -e "     the security profile (restricted/standard/full).${NC}"
  echo ""

  if [ -t 0 ]; then
    ask "Do you accept these terms? [y/N]: "
    read -r accept
    case "$accept" in
      [yY]|[yY][eE][sS])
        success "Terms accepted"
        ;;
      *)
        error "You must accept the terms to install MegaSloth."
        exit 1
        ;;
    esac
  else
    warn "Non-interactive mode — terms auto-accepted"
  fi

  # ═══════════════════════════════════════════════════
  # STEP 2: LLM API Key (the ONLY user input needed)
  # ═══════════════════════════════════════════════════
  step 2 "AI Provider Setup"

  echo -e "  ${WHITE}Choose your AI provider:${NC}"
  echo ""
  echo -e "    ${CYAN}1)${NC} Claude  ${DIM}(Anthropic) — recommended${NC}"
  echo -e "    ${CYAN}2)${NC} OpenAI  ${DIM}(GPT-5.2)${NC}"
  echo -e "    ${CYAN}3)${NC} Gemini  ${DIM}(Google)${NC}"
  echo ""

  if [ -t 0 ]; then
    ask "Choose [1/2/3] (default: 1): "
    read -r llm_choice
  else
    llm_choice="1"
  fi

  case "$llm_choice" in
    2) LLM_PROVIDER="openai";  KEY_PREFIX="sk-";      KEY_LABEL="OpenAI API Key" ;;
    3) LLM_PROVIDER="gemini";  KEY_PREFIX="AIza";     KEY_LABEL="Google Gemini API Key" ;;
    *)  LLM_PROVIDER="claude";  KEY_PREFIX="sk-ant-";  KEY_LABEL="Anthropic API Key" ;;
  esac

  success "Provider: ${BOLD}$LLM_PROVIDER${NC}"
  echo ""

  if [ -t 0 ]; then
    ask "${KEY_LABEL} (${KEY_PREFIX}...): "
    read -rs api_key
    echo ""

    if [ -n "${api_key:-}" ]; then
      success "API Key: ****${api_key: -4}"
    else
      warn "No key entered — set it later in the app Settings"
    fi
  else
    api_key=""
    warn "Non-interactive mode — set API key in the app Settings"
  fi

  echo ""
  echo -e "  ${GREEN}${BOLD}That's it! MegaSloth will handle everything else.${NC}"
  echo -e "  ${DIM}  GitHub, GitLab, AWS, Redis — the agent provisions it all.${NC}"

  # ═══════════════════════════════════════════════════
  # STEP 3: Auto-install all dependencies (silent)
  # ═══════════════════════════════════════════════════
  step 3 "Installing dependencies (automatic)"

  # Node.js
  NODE_VERSION=$(get_node_version)
  if [ "$NODE_VERSION" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
    success "Node.js v$(node -v 2>/dev/null | sed 's/v//')"
  else
    info "Installing Node.js..."
    auto_install_node
    if check_command node; then
      success "Node.js v$(node -v 2>/dev/null | sed 's/v//')"
    else
      error "Failed to install Node.js. Install manually: https://nodejs.org"
      exit 1
    fi
  fi

  # pnpm
  auto_install_pnpm
  check_command pnpm && success "pnpm $(pnpm -v 2>/dev/null)" || warn "pnpm not available"

  # Redis
  if redis-cli ping &>/dev/null 2>&1; then
    success "Redis: running"
  else
    info "Installing Redis..."
    auto_install_redis
    redis-cli ping &>/dev/null 2>&1 && success "Redis: running" || warn "Redis: will start on first use"
  fi

  # GitHub CLI
  if check_command gh; then
    success "GitHub CLI: $(gh --version 2>/dev/null | head -1 | awk '{print $3}')"
  else
    info "Installing GitHub CLI..."
    auto_install_gh
    check_command gh && success "GitHub CLI: installed" || info "GitHub CLI: agent will use OAuth Device Flow instead"
  fi

  # ═══════════════════════════════════════════════════
  # STEP 4: Download, build, install app
  # ═══════════════════════════════════════════════════
  step 4 "Installing MegaSloth"

  if [ -d "$MEGASLOTH_DIR" ]; then
    info "Updating existing installation..."
    cd "$MEGASLOTH_DIR"
    git pull origin main 2>/dev/null || {
      warn "Update failed, performing fresh install..."
      cd "$HOME"
      rm -rf "$MEGASLOTH_DIR"
      git clone --depth 1 "$MEGASLOTH_REPO" "$MEGASLOTH_DIR"
      cd "$MEGASLOTH_DIR"
    }
  else
    info "Downloading MegaSloth..."
    git clone --depth 1 "$MEGASLOTH_REPO" "$MEGASLOTH_DIR"
    cd "$MEGASLOTH_DIR"
  fi

  success "Source: $MEGASLOTH_DIR"

  # Install deps & build core
  info "Installing packages..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  success "Packages installed"

  info "Building core..."
  pnpm build 2>/dev/null || warn "TypeScript build skipped (dev mode available)"

  # Create data directories
  mkdir -p .megasloth/data .megasloth/skills

  # Generate .env (no user interaction needed beyond what we already have)
  local anthropic_key="" openai_key="" gemini_key=""
  case "$LLM_PROVIDER" in
    claude)  anthropic_key="${api_key:-}" ;;
    openai)  openai_key="${api_key:-}" ;;
    gemini)  gemini_key="${api_key:-}" ;;
  esac

  local webhook_secret
  webhook_secret=$(openssl rand -hex 20 2>/dev/null || head -c 40 /dev/urandom | od -A n -t x1 | tr -d ' \n')

  # Auto-detect GitHub token if gh is logged in
  local github_token=""
  if check_command gh && gh auth status &>/dev/null 2>&1; then
    github_token=$(gh auth token 2>/dev/null || true)
  fi

  cat > "$MEGASLOTH_DIR/.env" <<ENVEOF
# MegaSloth Configuration (auto-generated)
LLM_PROVIDER=${LLM_PROVIDER}
ANTHROPIC_API_KEY=${anthropic_key}
OPENAI_API_KEY=${openai_key}
GEMINI_API_KEY=${gemini_key}
GITHUB_TOKEN=${github_token}
GITHUB_WEBHOOK_SECRET=${webhook_secret}
SECURITY_PROFILE=full
HTTP_PORT=13000
WEBHOOK_PORT=3001
WEBSOCKET_PORT=18789
REDIS_URL=redis://localhost:6379
DATABASE_URL=${MEGASLOTH_DIR}/.megasloth/data/megasloth.db
LOG_LEVEL=info
ENVEOF

  success "Configuration generated"

  # Build Electron desktop app
  info "Building desktop app..."
  if [ -d "desktop" ]; then
    cd desktop
    pnpm install 2>/dev/null || npm install
    if [ "$OS" = "macos" ]; then
      pnpm build:mac 2>/dev/null && success "Desktop app built (macOS)" || warn "Desktop build skipped — use CLI mode"
    elif [ "$OS" = "linux" ]; then
      pnpm build:linux 2>/dev/null && success "Desktop app built (Linux)" || warn "Desktop build skipped — use CLI mode"
    fi
    cd "$MEGASLOTH_DIR"
  fi

  # ═══════════════════════════════════════════════════
  # STEP 5: Create command + launch
  # ═══════════════════════════════════════════════════
  step 5 "Finalizing"

  # Create CLI wrapper
  if [ -w "/usr/local/bin" ]; then
    INSTALL_BIN="/usr/local/bin/megasloth"
  elif [ -d "$HOME/.local/bin" ]; then
    INSTALL_BIN="$HOME/.local/bin/megasloth"
  else
    mkdir -p "$HOME/.local/bin"
    INSTALL_BIN="$HOME/.local/bin/megasloth"
  fi

  cat > "$INSTALL_BIN" <<'WRAPPER'
#!/usr/bin/env bash
MEGASLOTH_DIR="INSTALL_DIR_PLACEHOLDER"
cd "$MEGASLOTH_DIR" || exit 1

case "${1:-}" in
  start)
    echo "  🦥 Starting MegaSloth..."
    if [ -f "dist/index.js" ]; then node dist/index.js
    else npx tsx src/index.ts; fi ;;
  start:bg)
    echo "  🦥 Starting MegaSloth in background..."
    if [ -f "dist/index.js" ]; then nohup node dist/index.js > .megasloth/data/megasloth.log 2>&1 &
    else nohup npx tsx src/index.ts > .megasloth/data/megasloth.log 2>&1 &; fi
    echo $! > .megasloth/data/megasloth.pid
    echo "  ✓ Running (PID: $!)" ;;
  stop)
    [ -f ".megasloth/data/megasloth.pid" ] && kill "$(cat .megasloth/data/megasloth.pid)" 2>/dev/null && rm -f .megasloth/data/megasloth.pid && echo "  ✓ Stopped" || echo "  Not running" ;;
  app)
    APP_PATH=""
    [ -d "desktop/release" ] && APP_PATH=$(find desktop/release -name "MegaSloth*" -type d 2>/dev/null | head -1)
    if [ -n "$APP_PATH" ] && [ "$OSTYPE" = "darwin"* ]; then open "$APP_PATH"
    elif [ -n "$APP_PATH" ]; then "$APP_PATH" &
    else echo "  Desktop app not built. Run: megasloth start"; fi ;;
  status)
    echo "  🦥 MegaSloth Status"
    echo "  Install: $MEGASLOTH_DIR"
    [ -f ".megasloth/data/megasloth.pid" ] && kill -0 "$(cat .megasloth/data/megasloth.pid)" 2>/dev/null && echo "  Agent: ✓ Running" || echo "  Agent: ✗ Stopped"
    redis-cli ping &>/dev/null && echo "  Redis: ✓ Connected" || echo "  Redis: ✗ Not reachable"
    curl -sf http://localhost:13000/health &>/dev/null && echo "  API:   ✓ Healthy" || echo "  API:   ✗ Not reachable" ;;
  logs)   tail -f .megasloth/data/megasloth.log 2>/dev/null || echo "  No logs yet. Start first: megasloth start" ;;
  config) "${EDITOR:-nano}" .env ;;
  update) git pull origin main && pnpm install && pnpm build 2>/dev/null; echo "  ✓ Updated" ;;
  uninstall)
    echo -n "  Remove MegaSloth? [y/N]: "; read -r yn
    case "$yn" in [yY]*) rm -rf "$MEGASLOTH_DIR" "SELF_PATH_PLACEHOLDER"; echo "  ✓ Uninstalled" ;; *) echo "  Cancelled" ;; esac ;;
  help|--help|-h|"")
    echo "  🦥 MegaSloth — Full Automation Agent"
    echo ""
    echo "  megasloth start      Start agent (foreground)"
    echo "  megasloth start:bg   Start agent (background)"
    echo "  megasloth app        Launch desktop app"
    echo "  megasloth stop       Stop agent"
    echo "  megasloth status     Show status"
    echo "  megasloth logs       View logs"
    echo "  megasloth config     Edit settings"
    echo "  megasloth update     Update to latest"
    echo "  megasloth uninstall  Remove MegaSloth" ;;
  *) echo "  Unknown: $1 — run 'megasloth help'" ;;
esac
WRAPPER

  sed -i.bak "s|INSTALL_DIR_PLACEHOLDER|$MEGASLOTH_DIR|g" "$INSTALL_BIN" 2>/dev/null || \
  sed -i '' "s|INSTALL_DIR_PLACEHOLDER|$MEGASLOTH_DIR|g" "$INSTALL_BIN"
  sed -i.bak "s|SELF_PATH_PLACEHOLDER|$INSTALL_BIN|g" "$INSTALL_BIN" 2>/dev/null || \
  sed -i '' "s|SELF_PATH_PLACEHOLDER|$INSTALL_BIN|g" "$INSTALL_BIN"
  rm -f "${INSTALL_BIN}.bak"
  chmod +x "$INSTALL_BIN"
  success "Command: $INSTALL_BIN"

  # Add to PATH if needed
  if ! echo "$PATH" | grep -q "$(dirname "$INSTALL_BIN")"; then
    SHELL_RC=""
    case "$SHELL" in
      */zsh)  SHELL_RC="$HOME/.zshrc" ;;
      */bash) SHELL_RC="$HOME/.bashrc" ;;
    esac
    if [ -n "$SHELL_RC" ]; then
      echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
      info "Added to $SHELL_RC — restart terminal or: source $SHELL_RC"
    fi
  fi

  # ═══════════════════════════════════════════════════
  # Done!
  # ═══════════════════════════════════════════════════
  echo ""
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}${BOLD}  🦥  MegaSloth installed successfully!${NC}"
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${WHITE}The agent has full control. It will automatically:${NC}"
  echo ""
  echo -e "    ${GREEN}✓${NC} Provision GitHub/GitLab/AWS/GCP credentials"
  echo -e "    ${GREEN}✓${NC} Set up CI/CD pipelines and webhooks"
  echo -e "    ${GREEN}✓${NC} Execute shell commands and manage processes"
  echo -e "    ${GREEN}✓${NC} Browse the web and automate browser tasks"
  echo -e "    ${GREEN}✓${NC} Read/write/edit local files"
  echo -e "    ${GREEN}✓${NC} Plan and execute complex workflows"
  echo ""
  echo -e "  ${WHITE}Get started:${NC}"
  echo ""
  echo -e "    ${CYAN}megasloth start${NC}    Start the agent"
  echo -e "    ${CYAN}megasloth app${NC}      Launch desktop app"
  echo -e "    ${CYAN}megasloth help${NC}     Show all commands"
  echo ""
  echo -e "  ${WHITE}Docs:${NC} ${BLUE}https://github.com/stronghuni/MegaSloth${NC}"
  echo ""
}

main "$@"
