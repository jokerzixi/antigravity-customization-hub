#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Skill & MCP Studio - One-Click Installer
Installs the customization hub as an official Antigravity Sidecar UI plugin.
"""

import os
import sys
import shutil
import platform
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
HOME_DIR = Path.home()
TARGET_SIDECAR_DIR = HOME_DIR / ".gemini" / "config" / "sidecars" / "customization-hub"

def install():
    print("=" * 60)
    print("  Antigravity Skill & MCP Studio Installer")
    print("=" * 60)
    print(f"[*] Source directory: {BASE_DIR}")
    print(f"[*] Target Sidecar:  {TARGET_SIDECAR_DIR}")

    # 1. 检查 Node.js
    if shutil.which("node") is None:
        print("[-] Error: 'node' not found in PATH. Please install Node.js first.")
        sys.exit(1)

    # 2. 创建目标目录
    TARGET_SIDECAR_DIR.mkdir(parents=True, exist_ok=True)

    # 3. 复制核心文件
    files_to_copy = ["sidecar.json", "server.js"]
    for f in files_to_copy:
        src = BASE_DIR / f
        dst = TARGET_SIDECAR_DIR / f
        if src.exists():
            shutil.copy2(src, dst)
            print(f" [+] Copied: {f}")

    # 复制 public 静态目录
    public_src = BASE_DIR / "public"
    public_dst = TARGET_SIDECAR_DIR / "public"
    if public_src.exists():
        if public_dst.exists():
            shutil.rmtree(public_dst)
        shutil.copytree(public_src, public_dst)
        print(" [+] Copied: public/ (UI assets)")

    print("\n" + "=" * 60)
    print(" [+] Installed successfully as an Antigravity Sidecar!")
    print(" [!] Please restart Antigravity 2.0 to mount the new Sidecar.")
    print(" [!] You can also access it directly in browser at:")
    print("     http://127.0.0.1:38292")
    print("=" * 60)

def uninstall():
    print(f"[*] Uninstalling from {TARGET_SIDECAR_DIR} ...")
    if TARGET_SIDECAR_DIR.exists():
        shutil.rmtree(TARGET_SIDECAR_DIR, ignore_errors=True)
        print(" [+] Successfully removed sidecar directory.")
    else:
        print(" [!] Sidecar directory does not exist.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ["--uninstall", "-u"]:
        uninstall()
    else:
        install()
