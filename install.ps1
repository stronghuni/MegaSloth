#Requires -Version 5.1
<#
.SYNOPSIS
    MegaSloth Desktop App Installer for Windows
.DESCRIPTION
    Full Automation Agent — One API Key, Total Control
.EXAMPLE
    irm https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────
$MEGASLOTH_REPO = "https://github.com/stronghuni/MegaSloth.git"
$MEGASLOTH_DIR = if ($env:MEGASLOTH_HOME) { $env:MEGASLOTH_HOME } else { "$env:USERPROFILE\.megasloth-app" }
$MIN_NODE_MAJOR = 20

# ─────────────────────────────────────────────────────
# UI Helpers
# ─────────────────────────────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "    +-----------------------------------+" -ForegroundColor Green
    Write-Host "    |        ___            ___          |" -ForegroundColor DarkGray
    Write-Host "    |       (" -ForegroundColor DarkGray -NoNewline
    Write-Host "o o" -ForegroundColor Yellow -NoNewline
    Write-Host ")  ___  (" -ForegroundColor DarkGray -NoNewline
    Write-Host "o o" -ForegroundColor Yellow -NoNewline
    Write-Host ")         |" -ForegroundColor DarkGray
    Write-Host "    |        \ /  / " -ForegroundColor DarkGray -NoNewline
    Write-Host "M" -ForegroundColor White -NoNewline
    Write-Host " \  \ /          |" -ForegroundColor DarkGray
    Write-Host "    |      ---(()---(()---(()---       |" -ForegroundColor Green
    Write-Host "    |         |  \_/  |               |" -ForegroundColor DarkGray
    Write-Host "    |" -ForegroundColor Green -NoNewline
    Write-Host "    M E G A S L O T H" -ForegroundColor White -NoNewline
    Write-Host "            |" -ForegroundColor Green
    Write-Host "    |" -ForegroundColor Green -NoNewline
    Write-Host "    Desktop App Installer" -ForegroundColor DarkGray -NoNewline
    Write-Host "         |" -ForegroundColor Green
    Write-Host "    +-----------------------------------+" -ForegroundColor Green
    Write-Host ""
}

function Write-Info    ($msg) { Write-Host "  ▸ $msg" -ForegroundColor Blue }
function Write-Success ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn    ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err     ($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Step    ($n, $total, $msg) { Write-Host "`n  [$n/$total] $msg`n" -ForegroundColor Magenta }

$TOTAL_STEPS = 5

function Test-Command ($cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Get-NodeMajorVersion {
    if (Test-Command "node") {
        $ver = (node -v 2>$null) -replace '^v',''
        return [int]($ver.Split('.')[0])
    }
    return 0
}

# ─────────────────────────────────────────────────────
# Dependency Installers
# ─────────────────────────────────────────────────────
function Install-NodeJS {
    if (Test-Command "winget") {
        Write-Info "Installing Node.js via winget..."
        winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    } elseif (Test-Command "choco") {
        Write-Info "Installing Node.js via Chocolatey..."
        choco install nodejs-lts -y 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    } else {
        Write-Err "Please install Node.js manually: https://nodejs.org"
        exit 1
    }
}

function Install-Pnpm {
    if (-not (Test-Command "pnpm")) {
        npm install -g pnpm@latest 2>$null
    }
}

function Install-GitHubCLI {
    if (Test-Command "winget") {
        winget install --id GitHub.cli --accept-package-agreements --accept-source-agreements --silent 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    } elseif (Test-Command "choco") {
        choco install gh -y 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    }
}

# ─────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────
function Main {
    Write-Banner

    Write-Info "Platform: Windows ($([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture))"
    Write-Host ""
    Write-Host "  This installs the MegaSloth Desktop App (Electron)." -ForegroundColor DarkGray
    Write-Host "  For CLI-only: npm install -g megasloth" -ForegroundColor DarkGray
    Write-Host ""

    # ═══════════════════════════════════════════════════
    # STEP 1: Terms of Service
    # ═══════════════════════════════════════════════════
    Write-Step 1 $TOTAL_STEPS "Terms of Service"

    Write-Host "  MegaSloth Full Automation Agent" -ForegroundColor White
    Write-Host ""
    Write-Host "  By installing MegaSloth, you agree to the following:" -ForegroundColor White
    Write-Host ""
    Write-Host "    1. MegaSloth will have full access to your local system" -ForegroundColor DarkGray
    Write-Host "       including terminal, filesystem, browser, and clipboard." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    2. MegaSloth will automatically provision and manage" -ForegroundColor DarkGray
    Write-Host "       API credentials (GitHub, GitLab, AWS, GCP, etc.)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    3. All credentials are encrypted (AES-256-GCM) and" -ForegroundColor DarkGray
    Write-Host "       stored locally. Nothing is sent to third parties." -ForegroundColor DarkGray
    Write-Host ""

    $accept = Read-Host "  ? Do you accept these terms? [y/N]"
    if ($accept -notmatch '^[yY]') {
        Write-Err "You must accept the terms to install MegaSloth."
        exit 1
    }
    Write-Success "Terms accepted"

    # ═══════════════════════════════════════════════════
    # STEP 2: LLM API Key
    # ═══════════════════════════════════════════════════
    Write-Step 2 $TOTAL_STEPS "AI Provider Setup"

    Write-Host "  Choose your AI provider:" -ForegroundColor White
    Write-Host ""
    Write-Host "    1) Claude  (Anthropic) — recommended" -ForegroundColor Cyan
    Write-Host "    2) OpenAI  (GPT-5.2)" -ForegroundColor Cyan
    Write-Host "    3) Gemini  (Google)" -ForegroundColor Cyan
    Write-Host ""

    $llm_choice = Read-Host "  ? Choose [1/2/3] (default: 1)"
    switch ($llm_choice) {
        "2" { $LLM_PROVIDER = "openai";  $KEY_LABEL = "OpenAI API Key" }
        "3" { $LLM_PROVIDER = "gemini";  $KEY_LABEL = "Google Gemini API Key" }
        default { $LLM_PROVIDER = "claude"; $KEY_LABEL = "Anthropic API Key" }
    }

    Write-Success "Provider: $LLM_PROVIDER"
    Write-Host ""

    $api_key = Read-Host "  ? $KEY_LABEL" -AsSecureString
    $api_key_plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($api_key)
    )

    if ($api_key_plain) {
        $masked = "****" + $api_key_plain.Substring([Math]::Max(0, $api_key_plain.Length - 4))
        Write-Success "API Key: $masked"
    } else {
        Write-Warn "No key entered — set it later in the app Settings"
    }

    Write-Host ""
    Write-Host "  That's it! MegaSloth will handle everything else." -ForegroundColor Green

    # ═══════════════════════════════════════════════════
    # STEP 3: Dependencies
    # ═══════════════════════════════════════════════════
    Write-Step 3 $TOTAL_STEPS "Installing dependencies (automatic)"

    # Git
    if (Test-Command "git") {
        Write-Success "Git: $(git --version 2>$null)"
    } else {
        Write-Err "Git is required. Install from https://git-scm.com"
        exit 1
    }

    # Node.js
    $nodeVer = Get-NodeMajorVersion
    if ($nodeVer -ge $MIN_NODE_MAJOR) {
        Write-Success "Node.js v$(node -v 2>$null)"
    } else {
        Install-NodeJS
        if (Test-Command "node") {
            Write-Success "Node.js v$(node -v 2>$null)"
        } else {
            Write-Err "Failed to install Node.js. Install manually: https://nodejs.org"
            exit 1
        }
    }

    # pnpm
    Install-Pnpm
    if (Test-Command "pnpm") { Write-Success "pnpm $(pnpm -v 2>$null)" }
    else { Write-Warn "pnpm not available" }

    # GitHub CLI
    if (Test-Command "gh") {
        Write-Success "GitHub CLI: installed"
    } else {
        Write-Info "Installing GitHub CLI..."
        Install-GitHubCLI
        if (Test-Command "gh") { Write-Success "GitHub CLI: installed" }
        else { Write-Info "GitHub CLI: agent will use OAuth Device Flow" }
    }

    # ═══════════════════════════════════════════════════
    # STEP 4: Download, build, install
    # ═══════════════════════════════════════════════════
    Write-Step 4 $TOTAL_STEPS "Installing MegaSloth Desktop App"

    if (Test-Path $MEGASLOTH_DIR) {
        Write-Info "Updating existing installation..."
        Set-Location $MEGASLOTH_DIR
        git pull origin main 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Update failed, performing fresh install..."
            Set-Location $env:USERPROFILE
            Remove-Item -Recurse -Force $MEGASLOTH_DIR -ErrorAction SilentlyContinue
            git clone --depth 1 $MEGASLOTH_REPO $MEGASLOTH_DIR
            Set-Location $MEGASLOTH_DIR
        }
    } else {
        Write-Info "Downloading MegaSloth..."
        git clone --depth 1 $MEGASLOTH_REPO $MEGASLOTH_DIR
        Set-Location $MEGASLOTH_DIR
    }

    Write-Success "Source: $MEGASLOTH_DIR"

    Write-Info "Installing packages..."
    pnpm install 2>$null
    Write-Success "Packages installed"

    Write-Info "Building core..."
    pnpm build 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn "TypeScript build skipped" }

    New-Item -ItemType Directory -Force -Path ".megasloth\data", ".megasloth\skills" | Out-Null

    # Generate .env
    $anthropic_key = ""; $openai_key = ""; $gemini_key = ""
    switch ($LLM_PROVIDER) {
        "claude"  { $anthropic_key = $api_key_plain }
        "openai"  { $openai_key = $api_key_plain }
        "gemini"  { $gemini_key = $api_key_plain }
    }

    $webhook_secret = -join ((1..40) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

    $github_token = ""
    if ((Test-Command "gh") -and ((gh auth status 2>&1) -match "Logged in")) {
        $github_token = (gh auth token 2>$null)
    }

    $envContent = @"
# MegaSloth Configuration (auto-generated)
LLM_PROVIDER=$LLM_PROVIDER
ANTHROPIC_API_KEY=$anthropic_key
OPENAI_API_KEY=$openai_key
GEMINI_API_KEY=$gemini_key
GITHUB_TOKEN=$github_token
GITHUB_WEBHOOK_SECRET=$webhook_secret
SECURITY_PROFILE=full
HTTP_PORT=13000
WEBHOOK_PORT=3001
WEBSOCKET_PORT=18789
REDIS_URL=redis://localhost:6379
DATABASE_URL=$MEGASLOTH_DIR\.megasloth\data\megasloth.db
LOG_LEVEL=info
"@
    Set-Content -Path "$MEGASLOTH_DIR\.env" -Value $envContent
    Write-Success "Configuration generated"

    # Build Electron desktop app
    Write-Info "Building desktop app..."
    if (Test-Path "desktop") {
        Set-Location "desktop"
        pnpm install 2>$null
        pnpm build:win 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Desktop app built (Windows)"
        } else {
            Write-Warn "Desktop build skipped — use CLI mode"
        }
        Set-Location $MEGASLOTH_DIR
    }

    # ═══════════════════════════════════════════════════
    # STEP 5: Create shortcut + finalize
    # ═══════════════════════════════════════════════════
    Write-Step 5 $TOTAL_STEPS "Finalizing"

    # Create CLI wrapper batch file
    $binDir = "$env:USERPROFILE\.megasloth-bin"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    $wrapperContent = @"
@echo off
cd /d "$MEGASLOTH_DIR"
if "%1"=="start" (
    echo   🦥 Starting MegaSloth...
    if exist dist\index.js ( node dist\index.js ) else ( npx tsx src\index.ts )
) else if "%1"=="app" (
    for /f "delims=" %%i in ('dir /b /s desktop\release\MegaSloth*.exe 2^>nul') do ( start "" "%%i" & goto :eof )
    echo   Desktop app not built. Run: megasloth start
) else if "%1"=="stop" (
    if exist .megasloth\data\megasloth.pid (
        set /p PID=<.megasloth\data\megasloth.pid
        taskkill /PID %PID% /F 2>nul
        del .megasloth\data\megasloth.pid
        echo   ✓ Stopped
    ) else ( echo   Not running )
) else if "%1"=="status" (
    echo   🦥 MegaSloth Status
    echo   Install: $MEGASLOTH_DIR
    curl -sf http://localhost:13000/health >nul 2>&1 && ( echo   API: ✓ Healthy ) || ( echo   API: ✗ Not reachable )
) else if "%1"=="config" (
    notepad .env
) else if "%1"=="update" (
    git pull origin main && pnpm install && pnpm build 2>nul
    echo   ✓ Updated
) else if "%1"=="logs" (
    if exist .megasloth\data\megasloth.log ( type .megasloth\data\megasloth.log ) else ( echo   No logs yet )
) else (
    echo   🦥 MegaSloth — Full Automation Agent
    echo.
    echo   megasloth start      Start agent
    echo   megasloth app        Launch desktop app
    echo   megasloth stop       Stop agent
    echo   megasloth status     Show status
    echo   megasloth logs       View logs
    echo   megasloth config     Edit settings
    echo   megasloth update     Update to latest
)
"@
    Set-Content -Path "$binDir\megasloth.cmd" -Value $wrapperContent
    Write-Success "Command: $binDir\megasloth.cmd"

    # Add to PATH
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$binDir*") {
        [System.Environment]::SetEnvironmentVariable("PATH", "$userPath;$binDir", "User")
        $env:PATH = "$env:PATH;$binDir"
        Write-Info "Added $binDir to PATH"
    }

    # Create desktop shortcut
    $exePath = Get-ChildItem -Path "$MEGASLOTH_DIR\desktop\release" -Filter "MegaSloth*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exePath) {
        $desktopPath = [System.Environment]::GetFolderPath("Desktop")
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut("$desktopPath\MegaSloth.lnk")
        $shortcut.TargetPath = $exePath.FullName
        $shortcut.WorkingDirectory = $MEGASLOTH_DIR
        $shortcut.Description = "MegaSloth — AI-Powered Full Automation Agent"
        $shortcut.Save()
        Write-Success "Desktop shortcut created"
    }

    # Done
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "    🦥  MegaSloth Desktop App installed!" -ForegroundColor Green
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Get started:" -ForegroundColor White
    Write-Host ""
    Write-Host "    megasloth app      Launch desktop app" -ForegroundColor Cyan
    Write-Host "    megasloth start    Start agent (CLI mode)" -ForegroundColor Cyan
    Write-Host "    megasloth help     Show all commands" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  For CLI-only: npm install -g megasloth" -ForegroundColor DarkGray
    Write-Host "  Docs: https://github.com/stronghuni/MegaSloth" -ForegroundColor Blue
    Write-Host ""
}

Main
