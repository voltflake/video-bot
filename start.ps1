#!/usr/bin/env pwsh

# NOTE: You can install dependencies using the winget command:
# winget install ffmpeg ImageMagick.ImageMagick OpenJS.NodeJS.LTS

# Add paths to executables if not already present (node, npm, ImageMagick and FFmpeg)
# $env:PATH = "C:\Program Files\nodejs;$env:PATH"
# $env:PATH = "C:\Program Files\ImageMagick-7.1.2-Q16-HDRI;$env:PATH"
# etc...

# Set your Discord bot token as an environment variable
$env:DISCORD_TOKEN = ""

# Change to project directory
Write-Host "📂 Changing to project directory..." -ForegroundColor Cyan
Set-Location $PSScriptRoot

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm i
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Compile TypeScript
Write-Host "🔨 Compiling TypeScript..." -ForegroundColor Cyan
npx tsc
Write-Host "✅ TypeScript compiled" -ForegroundColor Green

# Run the application
Write-Host "🚀 Starting application..." -ForegroundColor Cyan
node build\main.js
