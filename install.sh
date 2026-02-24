#!/usr/bin/env bash
#
#   MegaSloth Installer
#   Downloads and installs the MegaSloth desktop app.
#   Automatically installs all required dependencies (Node.js, pnpm, git).
#
#   Usage:
#     curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
#
set -euo pipefail

# ─────────────────────────────────────────────────────
REPO="stronghuni/MegaSloth"
GITHUB_API="https://api.github.com/repos/$REPO/releases/latest"
GITHUB_DL="https://github.com/$REPO/releases/latest/download"
REQUIRED_NODE_MAJOR=22

# ─────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

print_banner() {
  echo ""
  echo -e "${GREEN}  #########+. *.   +*##############${NC}"
  echo -e "${GREEN}  ########+..-:======+*:-##########${NC}"
  echo -e "${GREEN}  #######*.========+###+=+.*#######${NC}"
  echo -e "${GREEN}  ###**+..#+-=#*..=#===-*+:===*-.##${NC}"
  echo -e "${GREEN}  ##**=+***=-=#.==+-  -==#=====+**${NC}"
  echo -e "${GREEN}  #*******::.-===*+=.:==+*=========${NC}"
  echo -e "${GREEN}  #=++++*******=-.-- ==============${NC}"
  echo -e "${GREEN}  ###*+ -++++***** **** -=====:====${NC}"
  echo -e "${GREEN}  #######* :=+++***** .===== .-----${NC}"
  echo -e "${GREEN}  ##########*+ -++++**  :=+++++****${NC}"
  echo ""
  echo -e "${WHITE}${BOLD}  MegaSloth${NC} ${DIM}— Rules Every Repos${NC}"
  echo ""
}

# ─────────────────────────────────────────────────────
# OS / Arch Detection
# ─────────────────────────────────────────────────────
detect_platform() {
  OS="unknown"
  ARCH="$(uname -m)"

  case "$(uname -s)" in
    Darwin)  OS="macos" ;;
    Linux)   OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
  esac

  if [ "$OS" = "unknown" ]; then
    error "Unsupported OS: $(uname -s)"
    echo -e "  ${DIM}Windows users: download from GitHub Releases or run PowerShell installer${NC}"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────
# Download helpers
# ─────────────────────────────────────────────────────
download_file() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fSL --progress-bar -o "$dest" "$url"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress -O "$dest" "$url"
  else
    error "curl or wget required"
    exit 1
  fi
}

get_latest_version() {
  local ver=""
  if command -v curl &>/dev/null; then
    ver=$(curl -fsSL "$GITHUB_API" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
  elif command -v wget &>/dev/null; then
    ver=$(wget -qO- "$GITHUB_API" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
  fi
  echo "$ver"
}

# ─────────────────────────────────────────────────────
# Dependency: Git
# ─────────────────────────────────────────────────────
ensure_git() {
  if command -v git &>/dev/null; then
    success "git $(git --version | awk '{print $3}')"
    return 0
  fi

  info "Installing git..."
  case "$OS" in
    macos)
      if command -v xcode-select &>/dev/null; then
        xcode-select --install 2>/dev/null || true
        warn "Xcode Command Line Tools installation started"
        echo -e "    ${DIM}Please complete the installation dialog and re-run this script${NC}"
        exit 0
      fi
      ;;
    linux)
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq git
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y git
      elif command -v yum &>/dev/null; then
        sudo yum install -y git
      elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm git
      elif command -v apk &>/dev/null; then
        sudo apk add git
      else
        error "Could not install git. Please install manually."
        exit 1
      fi
      ;;
  esac

  if command -v git &>/dev/null; then
    success "git installed"
  else
    error "git installation failed. Please install manually."
    exit 1
  fi
}

# ─────────────────────────────────────────────────────
# Dependency: Node.js >= 22
# ─────────────────────────────────────────────────────
get_node_major() {
  local ver
  ver=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  echo "${ver:-0}"
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    return 0
  fi
  return 1
}

load_fnm() {
  if command -v fnm &>/dev/null; then
    eval "$(fnm env 2>/dev/null)" || true
    return 0
  fi
  return 1
}

ensure_node() {
  load_nvm 2>/dev/null || true
  load_fnm 2>/dev/null || true

  if command -v node &>/dev/null; then
    local major
    major=$(get_node_major)
    if [ "$major" -ge "$REQUIRED_NODE_MAJOR" ]; then
      success "Node.js $(node -v)"
      return 0
    fi
    warn "Node.js v$(node -v | sed 's/v//') found, but >= $REQUIRED_NODE_MAJOR required"
  else
    warn "Node.js not found"
  fi

  info "Installing Node.js $REQUIRED_NODE_MAJOR..."

  # Strategy 1: nvm (already installed)
  if load_nvm 2>/dev/null; then
    info "Using nvm..."
    nvm install "$REQUIRED_NODE_MAJOR" && nvm use "$REQUIRED_NODE_MAJOR" && nvm alias default "$REQUIRED_NODE_MAJOR"
    if [ "$(get_node_major)" -ge "$REQUIRED_NODE_MAJOR" ]; then
      success "Node.js $(node -v) via nvm"
      return 0
    fi
  fi

  # Strategy 2: fnm (already installed)
  if load_fnm 2>/dev/null; then
    info "Using fnm..."
    fnm install "$REQUIRED_NODE_MAJOR" && fnm use "$REQUIRED_NODE_MAJOR" && fnm default "$REQUIRED_NODE_MAJOR"
    if [ "$(get_node_major)" -ge "$REQUIRED_NODE_MAJOR" ]; then
      success "Node.js $(node -v) via fnm"
      return 0
    fi
  fi

  # Strategy 3: Install nvm, then install Node
  info "Installing nvm + Node.js $REQUIRED_NODE_MAJOR..."
  export NVM_DIR="$HOME/.nvm"
  mkdir -p "$NVM_DIR"

  if command -v curl &>/dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  elif command -v wget &>/dev/null; then
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  . "$NVM_DIR/nvm.sh" 2>/dev/null || true

  if command -v nvm &>/dev/null 2>/dev/null || type nvm &>/dev/null; then
    nvm install "$REQUIRED_NODE_MAJOR"
    nvm use "$REQUIRED_NODE_MAJOR"
    nvm alias default "$REQUIRED_NODE_MAJOR"
    if [ "$(get_node_major)" -ge "$REQUIRED_NODE_MAJOR" ]; then
      success "Node.js $(node -v) via nvm (freshly installed)"
      echo ""
      warn "nvm was installed. Add this to your shell profile (~/.bashrc, ~/.zshrc):"
      echo -e "    ${CYAN}export NVM_DIR=\"\$HOME/.nvm\"${NC}"
      echo -e "    ${CYAN}[ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"${NC}"
      echo ""
      return 0
    fi
  fi

  # Strategy 4: Direct binary download (fallback)
  info "Downloading Node.js $REQUIRED_NODE_MAJOR directly..."
  local node_ver="v${REQUIRED_NODE_MAJOR}.0.0"
  local node_arch="$ARCH"
  local node_os=""
  local node_dir="$HOME/.local/node"

  case "$OS" in
    macos) node_os="darwin" ;;
    linux) node_os="linux" ;;
  esac

  case "$ARCH" in
    x64)   node_arch="x64" ;;
    arm64) node_arch="arm64" ;;
  esac

  # Get latest Node 22.x version from nodejs.org
  local latest_22=""
  latest_22=$(curl -fsSL "https://nodejs.org/dist/index.json" 2>/dev/null \
    | grep -o '"v22\.[0-9]*\.[0-9]*"' | head -1 | tr -d '"') || true

  if [ -n "$latest_22" ]; then
    node_ver="$latest_22"
  fi

  local tarball="node-${node_ver}-${node_os}-${node_arch}.tar.gz"
  local url="https://nodejs.org/dist/${node_ver}/${tarball}"
  local tmp_tar="/tmp/$tarball"

  download_file "$url" "$tmp_tar"

  rm -rf "$node_dir" 2>/dev/null || true
  mkdir -p "$node_dir"
  tar xzf "$tmp_tar" -C "$node_dir" --strip-components=1
  rm -f "$tmp_tar"

  export PATH="$node_dir/bin:$PATH"

  if [ "$(get_node_major)" -ge "$REQUIRED_NODE_MAJOR" ]; then
    success "Node.js $(node -v) installed to $node_dir"
    echo ""
    warn "Add this to your shell profile (~/.bashrc, ~/.zshrc):"
    echo -e "    ${CYAN}export PATH=\"$node_dir/bin:\$PATH\"${NC}"
    echo ""
    return 0
  fi

  error "Failed to install Node.js >= $REQUIRED_NODE_MAJOR"
  echo -e "  ${DIM}Please install manually: https://nodejs.org${NC}"
  exit 1
}

# ─────────────────────────────────────────────────────
# Dependency: pnpm
# ─────────────────────────────────────────────────────
ensure_pnpm() {
  if command -v pnpm &>/dev/null; then
    success "pnpm $(pnpm -v)"
    return 0
  fi

  info "Installing pnpm..."

  # Try corepack (built into Node 16+)
  if command -v corepack &>/dev/null; then
    corepack enable 2>/dev/null || true
    corepack prepare pnpm@latest --activate 2>/dev/null || true
    if command -v pnpm &>/dev/null; then
      success "pnpm $(pnpm -v) via corepack"
      return 0
    fi
  fi

  # Fallback: npm install
  if command -v npm &>/dev/null; then
    npm install -g pnpm@latest 2>/dev/null || sudo npm install -g pnpm@latest 2>/dev/null || true
    if command -v pnpm &>/dev/null; then
      success "pnpm $(pnpm -v) via npm"
      return 0
    fi
  fi

  # Fallback: standalone installer
  if command -v curl &>/dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
  elif command -v wget &>/dev/null; then
    wget -qO- https://get.pnpm.io/install.sh | sh -
  fi

  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
  export PATH="$PNPM_HOME:$PATH"

  if command -v pnpm &>/dev/null; then
    success "pnpm $(pnpm -v) via standalone installer"
    return 0
  fi

  error "Could not install pnpm. Please install manually: https://pnpm.io/installation"
  exit 1
}

# ─────────────────────────────────────────────────────
# Platform-specific installers (pre-built binary)
# ─────────────────────────────────────────────────────
install_macos() {
  local dmg_name="MegaSloth-${ARCH}.dmg"
  local dmg_path="/tmp/$dmg_name"

  info "Downloading MegaSloth for macOS ($ARCH)..."
  download_file "${GITHUB_DL}/${dmg_name}" "$dmg_path"

  info "Installing..."
  local mount_point
  mount_point=$(hdiutil attach "$dmg_path" -nobrowse -quiet 2>/dev/null | tail -1 | awk '{print $3}')

  if [ -z "$mount_point" ]; then
    mount_point=$(hdiutil attach "$dmg_path" -nobrowse 2>/dev/null | grep "/Volumes" | sed 's/.*\(\/Volumes\/.*\)/\1/')
  fi

  local app_src
  app_src=$(find "$mount_point" -name "MegaSloth.app" -maxdepth 2 -type d 2>/dev/null | head -1)

  if [ -z "$app_src" ]; then
    hdiutil detach "$mount_point" -quiet 2>/dev/null || true
    error "Could not find MegaSloth.app in DMG"
    exit 1
  fi

  rm -rf /Applications/MegaSloth.app 2>/dev/null || true
  cp -R "$app_src" /Applications/
  xattr -cr /Applications/MegaSloth.app 2>/dev/null || true

  hdiutil detach "$mount_point" -quiet 2>/dev/null || true
  rm -f "$dmg_path"

  success "Installed to /Applications/MegaSloth.app"
}

install_linux() {
  local appimage_name="MegaSloth.AppImage"
  local install_dir="$HOME/.local/bin"
  mkdir -p "$install_dir"

  info "Downloading MegaSloth for Linux..."
  download_file "${GITHUB_DL}/${appimage_name}" "$install_dir/$appimage_name"
  chmod +x "$install_dir/$appimage_name"

  if [ -f "$install_dir/$appimage_name" ]; then
    ln -sf "$install_dir/$appimage_name" "$install_dir/megasloth"
    success "Installed to $install_dir/$appimage_name"
  fi
}

install_windows() {
  local exe_name="MegaSloth-Setup.exe"
  local exe_path="$USERPROFILE/Downloads/$exe_name"

  info "Downloading MegaSloth for Windows..."
  download_file "${GITHUB_DL}/${exe_name}" "$exe_path"

  success "Downloaded to $exe_path"
  info "Running installer..."
  start "" "$exe_path" 2>/dev/null || echo -e "  ${DIM}Open $exe_path to install${NC}"
}

# ─────────────────────────────────────────────────────
# Fallback: build from source
# ─────────────────────────────────────────────────────
build_from_source() {
  warn "No pre-built release found. Building from source..."
  echo ""

  echo -e "  ${WHITE}${BOLD}Checking dependencies...${NC}"
  echo ""
  ensure_git
  ensure_node
  ensure_pnpm
  echo ""

  local MEGASLOTH_DIR="${MEGASLOTH_HOME:-$HOME/.megasloth-app}"

  if [ -d "$MEGASLOTH_DIR/.git" ]; then
    info "Updating existing source..."
    cd "$MEGASLOTH_DIR"
    git pull origin main 2>/dev/null || true
  else
    info "Cloning repository..."
    rm -rf "$MEGASLOTH_DIR" 2>/dev/null || true
    git clone --depth 1 "https://github.com/$REPO.git" "$MEGASLOTH_DIR"
    cd "$MEGASLOTH_DIR"
  fi

  info "Installing packages..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install

  info "Building..."
  pnpm build 2>/dev/null || true

  mkdir -p .megasloth/data .megasloth/skills

  if [ ! -f ".env" ]; then
    local webhook_secret
    webhook_secret=$(openssl rand -hex 20 2>/dev/null || echo "changeme")
    cat > .env <<ENVEOF
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
HTTP_PORT=13000
WEBHOOK_PORT=3001
WEBSOCKET_PORT=18789
REDIS_URL=redis://localhost:6379
DATABASE_URL=${MEGASLOTH_DIR}/.megasloth/data/megasloth.db
GITHUB_WEBHOOK_SECRET=${webhook_secret}
LOG_LEVEL=info
ENVEOF
  fi

  info "Building desktop app..."
  cd desktop
  pnpm install 2>/dev/null || npm install

  case "$OS" in
    macos)
      if pnpm build:mac 2>/dev/null; then
        local app_src
        app_src=$(find release -name "MegaSloth.app" -type d 2>/dev/null | head -1)
        if [ -n "$app_src" ]; then
          rm -rf /Applications/MegaSloth.app 2>/dev/null || true
          cp -R "$app_src" /Applications/
          xattr -cr /Applications/MegaSloth.app 2>/dev/null || true
          success "Installed to /Applications/MegaSloth.app"
        fi
      else
        warn "Desktop build failed"
      fi
      ;;
    linux)
      pnpm build:linux 2>/dev/null && success "Desktop app built (Linux)" || warn "Desktop build failed"
      ;;
  esac
}

# ─────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────
main() {
  print_banner
  detect_platform

  info "Platform: ${BOLD}$OS${NC} ($ARCH)"
  echo ""

  local VERSION
  VERSION=$(get_latest_version)

  if [ -n "$VERSION" ]; then
    info "Latest release: ${BOLD}$VERSION${NC}"
    echo ""

    case "$OS" in
      macos)   install_macos ;;
      linux)   install_linux ;;
      windows) install_windows ;;
    esac
  else
    build_from_source
  fi

  # ─── Done ────────────────────────────────────────
  echo ""
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}${BOLD}  🦥 MegaSloth installed!${NC}"
  echo -e "  ${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo ""

  case "$OS" in
    macos)
      echo -e "  ${WHITE}Launch:${NC}"
      echo -e "    ${CYAN}open -a MegaSloth${NC}"
      echo ""
      echo -e "  ${DIM}Configure your API key in the app's Settings.${NC}"
      ;;
    linux)
      echo -e "  ${WHITE}Launch:${NC}"
      echo -e "    ${CYAN}~/.local/bin/MegaSloth.AppImage${NC}"
      echo ""
      echo -e "  ${DIM}Configure your API key in the app's Settings.${NC}"
      ;;
    windows)
      echo -e "  ${DIM}Run the installer, then open MegaSloth from Start Menu.${NC}"
      echo -e "  ${DIM}Configure your API key in the app's Settings.${NC}"
      ;;
  esac

  echo ""
  echo -e "  ${WHITE}Docs:${NC} ${BLUE}https://github.com/$REPO${NC}"
  echo ""
}

main "$@"
