# LailatulCoder Ai

> An open-source AI coding agent that lives in your terminal — powered by LailatulCoder.Ai

<img width="903" height="671" alt="image" src="https://github.com/user-attachments/assets/7ae00b23-4da1-4586-9593-8cb5d8154a5f" />


## Features

- 🤖 AI coding assistant in your terminal
- 🔐 Connect with LailatulCoder.Ai API key
- 🔄 Auto-fetch available models from API
- 🌐 Supports Malay & English
- 📁 Read & write files, run commands
- 🔧 Multi-model support
- 💻 Cross-platform — Windows, macOS, and Linux (Intel & Apple Silicon / ARM)

## Requirements

- Node.js v22+ ([download for your OS](https://nodejs.org/en/download))
- LailatulCoder.Ai API key

## Installation

**Already have Node.js v22+?** Install directly:

```bash
npm install -g lailatulcoder
```

**Not sure, or don't have Node.js yet?** Use the installer script below — it checks for Node.js, installs it (or upgrades it) automatically if needed, then installs LailatulCoder Ai:

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.sh | bash
```

Then run it from any terminal:

```bash
lailatulcoder
```

<details>
<summary>Platform-specific notes</summary>

- **Windows**: Works in PowerShell, Command Prompt (`cmd.exe`), or Windows Terminal. The installer script uses `winget` when available, or downloads the official Node.js installer directly otherwise.
- **macOS**: The installer script uses [Homebrew](https://brew.sh) when available, or [nvm](https://github.com/nvm-sh/nvm) otherwise. Works on both Intel and Apple Silicon Macs.
- **Linux**: The installer script uses [nvm](https://github.com/nvm-sh/nvm) (works the same across distros, no root required). Works on both x64 and ARM64.

Clipboard image support and right-click paste (`@teddyzhu/clipboard`), the embedded terminal (`node-pty`), and image rendering (`sharp`) all ship as optional platform-specific dependencies — npm automatically installs the correct native binary for your OS and CPU architecture, no extra setup needed.

</details>

## Update

Get the latest version:

```bash
npm update -g lailatulcoder
```

If that doesn't pick up the newest release, force it directly:

```bash
npm install -g lailatulcoder@latest
```

Check what version you have installed:

```bash
lailatulcoder --version
```

## Uninstall

```bash
npm uninstall -g lailatulcoder
```

This removes the CLI only. Your settings and API key stay at `~/.lailatulcoder/` — delete that folder too if you want a completely clean removal:

- **macOS / Linux**: delete the `~/.lailatulcoder` folder
- **Windows (PowerShell)**: delete the `.lailatulcoder` folder inside `%USERPROFILE%`

## Quick Start

1. Run `lailatulcoder`
2. Type `/auth` to configure your API key
3. Select **LailatulCoder.Ai Authentication**
4. Enter your API key
5. Models will be fetched automatically
6. Start coding!

## Commands

| Command | Description |
|---------|-------------|
| `/auth` | Configure API key |
| `/logout` | Logout and clear API key |
| `/model` | Switch between models |
| `/clear` | Clear conversation |
| `/help` | Show all commands |

## Configuration

Settings are stored in `~/.lailatulcoder/settings.json`

## License

Apache 2.0 — Based on [Qwen Code](https://github.com/QwenLM/qwen-code) by Alibaba Group
