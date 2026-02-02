#!/usr/bin/env python3
"""Cross-platform replacement for install.sh

Creates a virtual environment, upgrades pip inside it, and installs
`gallery-dl` and `yt-dlp` (unless --no-packages). Prints how to activate
the environment for the user's shell.
"""

from __future__ import annotations
import argparse
import os
import platform
import shutil
import subprocess
import sys
import venv


def exit_with(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def get_venv_python(venv_dir: str) -> str:
    if os.name == "nt":
        return os.path.join(venv_dir, "Scripts", "python.exe")
    return os.path.join(venv_dir, "bin", "python")


def print_activation_hint(venv_dir: str) -> None:
    if os.name == "nt":
        print(f"[→] To activate the environment later (PowerShell):")
        print(f"    {venv_dir}\\Scripts\\Activate.ps1")
        print(f"[→] Or (cmd.exe):")
        print(f"    {venv_dir}\\Scripts\\activate.bat")
    else:
        print(f"[→] To activate the environment later, run:")
        print(f"    source {venv_dir}/bin/activate")


def ensure_venv_available() -> None:
    # venv is part of the stdlib for Python 3.3+, but some distros split it
    # into a separate package (e.g. `python3-venv` on Debian/Ubuntu).
    try:
        import venv  # type: ignore
    except Exception:
        msg = (
            "[!] The venv module is missing. Install it for your system, for example:\n"
            "  - Debian/Ubuntu: sudo apt install python3-venv\n"
            "  - Arch Linux: sudo pacman -S python\n"
            "  - Fedora: sudo dnf install python3-venv\n"
            "  - macOS: ensure Xcode command line tools or use brew python\n"
            "  - Windows: install Python from python.org and enable venv\n"
        )
        exit_with(msg)


def run_command(cmd: list[str], **kwargs) -> None:
    print(f"[*] Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create venv and install downloader tools")
    parser.add_argument("--venv", default="downloader_env", help="virtualenv directory (default: downloader_env)")
    parser.add_argument("--no-packages", action="store_true", help="create venv but do not install packages")
    args = parser.parse_args()

    if sys.version_info < (3, 6):
        exit_with("[!] Python 3.6+ is required to run this script.")

    ensure_venv_available()

    venv_dir = args.venv

    if os.path.exists(venv_dir):
        exit_with(f"[!] Directory '{venv_dir}' already exists. Remove it or choose another name.")

    print(f"[*] Creating virtual environment in '{venv_dir}'...")
    try:
        venv.create(venv_dir, with_pip=True)
    except Exception as exc:
        exit_with(f"[!] Failed to create virtual environment: {exc}")

    python_bin = get_venv_python(venv_dir)
    if not os.path.exists(python_bin):
        exit_with(f"[!] Virtualenv python not found at expected location: {python_bin}")

    try:
        print("[*] Upgrading pip...")
        run_command([python_bin, "-m", "pip", "install", "--upgrade", "pip"]) 

        if not args.no_packages:
            print("[*] Installing gallery-dl and yt-dlp...")
            run_command([python_bin, "-m", "pip", "install", "gallery-dl", "yt-dlp"]) 

    except subprocess.CalledProcessError as exc:
        exit_with(f"[!] An error occurred while installing packages: {exc}")

    print("\n[✔] Setup complete.")
    print_activation_hint(venv_dir)


if __name__ == "__main__":
    main()
