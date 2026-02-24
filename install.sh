#!/usr/bin/env bash
#
#   MegaSloth Installer
#   Downloads and installs the MegaSloth desktop app.
#
#   Usage:
#     curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
#
set -euo pipefail

# ─────────────────────────────────────────────────────
REPO="stronghuni/MegaSloth"
GITHUB_API="https://api.github.com/repos/$REPO/releases/latest"
GITHUB_DL="https://github.com/$REPO/releases/latest/download"

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
# Platform-specific installers
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

  local MEGASLOTH_DIR="${MEGASLOTH_HOME:-$HOME/.megasloth-app}"

  if ! command -v node &>/dev/null; then
    error "Node.js >= 22 required. Install from https://nodejs.org"
    exit 1
  fi

  if ! command -v pnpm &>/dev/null; then
    info "Installing pnpm..."
    npm install -g pnpm@latest 2>/dev/null || sudo npm install -g pnpm@latest
  fi

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
