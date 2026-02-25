#!/bin/bash
#
# MegaSloth macOS Post-Install Script
# Removes Gatekeeper quarantine flag to allow app to run
#

set -e

APP_PATH="/Applications/MegaSloth.app"

echo "🦥 MegaSloth Post-Install Setup"
echo "================================"
echo ""

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: MegaSloth.app not found in /Applications"
    echo "   Please install MegaSloth first."
    exit 1
fi

echo "📦 Found MegaSloth at: $APP_PATH"
echo "🔓 Removing quarantine flag..."

# Remove quarantine flag
xattr -cr "$APP_PATH" 2>/dev/null || {
    echo "⚠️  Could not remove quarantine flag."
    echo "   You may need to run: sudo xattr -cr '$APP_PATH'"
}

# Verify
if xattr "$APP_PATH" 2>/dev/null | grep -q "com.apple.quarantine"; then
    echo "⚠️  Quarantine flag still present. Trying with sudo..."
    sudo xattr -cr "$APP_PATH"
fi

echo ""
echo "✅ MegaSloth is now ready to run!"
echo ""
echo "You can launch it from:"
echo "  • Spotlight: Press Cmd+Space, type 'MegaSloth'"
echo "  • Applications folder"
echo "  • Terminal: open -a MegaSloth"
echo ""
echo "If you still see a security warning:"
echo "  1. Right-click on MegaSloth.app"
echo "  2. Select 'Open'"
echo "  3. Click 'Open' in the dialog"
echo ""
