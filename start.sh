#!/bin/sh

# Add paths to executables if not already present (node, npm, ImageMagick and FFmpeg)
# Set paths for needed executables
export PATH="/usr/bin:$PATH"
export PATH="/usr/local/bin/:$PATH"

# Change to project directory
echo "📂 Changing to project directory..."
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Set your Discord bot token
export DISCORD_TOKEN=""

# Install dependencies
echo "📦 Installing dependencies..."
npm i
echo "✅ Dependencies installed"

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npx tsc
echo "✅ TypeScript compiled"

# Run the application
echo "🚀 Starting application..."
node build/main.js
