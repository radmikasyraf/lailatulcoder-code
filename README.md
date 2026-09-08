# LailatulCoder Ai

> An open-source AI coding agent that lives in your terminal — powered by LailatulCoder.Ai

```
 ██╗      █████╗ ██╗██╗      █████╗ ████████╗██╗   ██╗██╗     
 ██║     ██╔══██╗██║██║     ██╔══██╗╚══██╔══╝██║   ██║██║     
 ██║     ███████║██║██║     ███████║   ██║   ██║   ██║██║     
 ██╗     ██╔══██║██║██╗     ██╔══██║   ██║   ██║   ██║██╗     
 ███████╗██║  ██║██║███████╗██║  ██║   ██║   ╚██████╔╝███████╗
 ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝
  ██████╗ ██████╗ ██████╗ ███████╗██████╗ 
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗
 ██║     ██║   ██║██║  ██║█████╗  ██████╔╝
 ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗
 ╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
```

## Features

- 🤖 AI coding assistant in your terminal
- 🔐 Connect with LailatulCoder.Ai API key
- 🔄 Auto-fetch available models from API
- 🌐 Supports Malay & English
- 📁 Read & write files, run commands
- 🔧 Multi-model support

## Requirements

- Node.js v22+
- LailatulCoder.Ai API key

## Installation

### Windows (PowerShell)

```powershell
# Install via npm
irm https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.ps1 | iex

# Run
lailatulcoder
```

### macOS / Linux

```bash
# Install via npm
curl -fsSL https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.sh | bash

# Run
lailatulcoder
```

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
