#!/bin/bash

set -e

VENV_DIR="downloader_env"

# Check if python is installed
if ! command -v python3 &>/dev/null; then
    echo "[!] Python 3 is not installed. Install it with:"
    echo "    sudo pacman -S python"
    exit 1
fi

# Check if venv module is available (usually comes with python package)
if [ ! -d /usr/lib/python3.*/venv ]; then
    echo "[!] The venv module is missing. Install it with:"
    echo "    sudo pacman -S python"
    exit 1
fi

echo "[*] Creating virtual environment in '$VENV_DIR'..."
python3 -m venv "$VENV_DIR"

echo "[*] Activating virtual environment..."
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

echo "[*] Upgrading pip..."
pip install --upgrade pip

echo "[*] Installing gallery-dl and yt-dlp..."
pip install gallery-dl yt-dlp

echo
echo "[✔] Setup complete."
echo "[→] To activate the environment later, run:"
echo "    source $VENV_DIR/bin/activate"
