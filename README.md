<div align="center">

[![npm version](https://img.shields.io/npm/v/@lailatul-coder/lailatul-coder.svg)](https://www.npmjs.com/package/@lailatul-coder/lailatul-coder)
[![License](https://img.shields.io/github/license/LailatulCoder/lailatul-coder.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![Downloads](https://img.shields.io/npm/dm/@lailatul-coder/lailatul-coder.svg)](https://www.npmjs.com/package/@lailatul-coder/lailatul-coder)

<a href="https://trendshift.io/repositories/15287" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15287" alt="LailatulCoder%2Flailatul-coder | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**The open-source AI coding agent that lives in your terminal.**

<a href="https://LailatulCoder.github.io/lailatul-coder-docs/zh/users/overview">中文</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/de/users/overview">Deutsch</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/fr/users/overview">français</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/ja/users/overview">日本語</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/ru/users/overview">Русский</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/pt-BR/users/overview">Português (Brasil)</a> |
<a href="https://LailatulCoder.github.io/lailatul-coder-docs/ko/users/overview">한국어</a>

</div>

## Why LailatulCoder Ai?

- **Agentic out of the box** — Auto-Memory, Auto-Skills, SubAgents, Agent Teams, and MCP. Dynamic workflows, zero setup.
- **Open-source, inside and out** — The framework and the Qwen models are open-source. They evolve together. No vendor lock-in.
- **Multi-protocol** — Supports OpenAI, Anthropic, Gemini, and Qwen APIs. Any third-party provider or local model (Ollama / vLLM). Switch at runtime.
- **Beyond the terminal** — IDE plugins, Desktop app, daemon mode, SDKs, and IM bots (Telegram / DingTalk / WeChat / Feishu).

> [!TIP]
> LailatulCoder Ai is actively iterating on itself — using its own agent and models to file issues, submit PRs, review code, and run tests. Powered by the community, driven by AI.

## Installation

**Linux / macOS:**

```bash
curl -fsSL https://lailatul-coder-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows:**

```powershell
irm https://lailatul-coder-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> Restart your terminal after installation to ensure environment variables take effect.

<details>
<summary>NPM / Homebrew</summary>

**NPM** (requires [Node.js 22+](https://nodejs.org/)):

```bash
npm install -g @lailatul-coder/lailatul-coder@latest
```

**Homebrew** (macOS / Linux):

```bash
brew install lailatul-coder
```

</details>

## Quick Start

```bash
qwen          # Launch interactive terminal UI
# Inside the session:
/auth         # Configure your provider and API key
```

See the [Authentication Guide](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/configuration/auth/) and [Settings Reference](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/configuration/settings/) for detailed setup.

![LailatulCoder Ai](https://img.alicdn.com/imgextra/i2/O1CN01K0nwj41RM1Il8kB0t_!!6000000002096-2-tps-1544-1060.png)

## How to Use LailatulCoder Ai

| Mode            | Command         | Use Case                                                                                                                                                                                                                                        |
| --------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive** | `qwen`          | Terminal UI with rich rendering, `@file` references, slash commands                                                                                                                                                                             |
| **Headless**    | `qwen -p "..."` | Scripts, CI/CD, batch processing — no UI                                                                                                                                                                                                        |
| **IDE**         | —               | [VS Code](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/integration-vscode/), [Zed](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/integration-zed/), [JetBrains](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/integration-jetbrains/) |
| **Desktop**     | —               | [LailatulCoder Ai Desktop](https://github.com/LailatulCoder/lailatul-coder/releases/tag/desktop-latest) — GUI for macOS, Windows, Linux                                                                                                                            |
| **Daemon**      | `qwen serve`    | Shared agent session over HTTP+SSE (ACP). Multiple clients, one agent. _(experimental)_ [Docs](https://LailatulCoder.github.io/lailatul-coder-docs/en/users/qwen-serve)                                                                                     |
| **SDK**         | —               | [TypeScript](./packages/sdk-typescript/README.md), [Python](./packages/sdk-python/README.md), [Java](./packages/sdk-java/qwencode/README.md)                                                                                                    |
| **IM Bot**      | `qwen channel`  | Connect to Telegram, DingTalk, WeChat, or Feishu                                                                                                                                                                                                |

<details>
<summary>SDK example (Python)</summary>

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main() -> None:
    result = query(
        "Summarize the repository layout.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    )

    async for message in result:
        if is_sdk_result_message(message):
            print(message["result"])


asyncio.run(main())
```

</details>

## Capabilities

If you know Claude Code, you already know LailatulCoder Ai — and then some. We've put significant effort into [bringing LailatulCoder Ai to feature parity with Claude Code](https://github.com/wenshao/codeagents/blob/main/docs/comparison/lailatul-coder-improvement-report.md), improving both breadth and reliability across the board.

| Feature                                                            | LailatulCoder Ai | Claude Code |
| ------------------------------------------------------------------ | :-------: | :---------: |
| SubAgents, Agent Teams, Dynamic Workflows                          |     ✓     |      ✓      |
| Auto-Memory, Auto-Skills, Hooks                                    |     ✓     |      ✓      |
| Built-in Skills (/review, /batch, /loop, /bugfix…)                 |     ✓     |      ✓      |
| MCP, Plan Mode, LSP Integration                                    |     ✓     |      ✓      |
| Auto Mode, Sandbox, Git Worktrees                                  |     ✓     |      ✓      |
| Computer Use (desktop automation)                                  |     ✓     |      ✓      |
| IDE Plugins (VS Code / JetBrains / Zed)                            |     ✓     |      ✓      |
| SDK                                                                |     ✓     |      ✓      |
| Headless Mode, Session Management                                  |     ✓     |      ✓      |
| Open-source — model and framework                                  |     ✓     |      —      |
| Multi-protocol (OpenAI / Anthropic / Gemini / Qwen + any provider) |     ✓     |      —      |
| Agent Arena (multi-model head-to-head on same task)                |     ✓     |      —      |
| Daemon Mode — `qwen serve` (multi-client shared agent)             |     ✓     |      —      |
| IM Channels (Telegram / DingTalk / WeChat / Feishu)                |     ✓     |      —      |

## Ecosystem

- [**LailatulCoder Ai Desktop**](https://github.com/LailatulCoder/lailatul-coder/releases/tag/desktop-latest) — Official desktop app for macOS, Windows, and Linux
- [**AionUi**](https://github.com/iOfficeAI/AionUi) — A modern GUI for command-line AI tools including LailatulCoder Ai
- [**Gemini CLI Desktop**](https://github.com/Piebald-AI/gemini-cli-desktop) — A cross-platform desktop/web/mobile UI for LailatulCoder Ai

- [**🦞 LailatulCoder Ai Claw**](https://github.com/openclaw/acpx) — Let other agents (Claude, Codex, etc.) delegate coding tasks to LailatulCoder Ai via ACP. Paste this prompt into your agent:

```text
Use LailatulCoder Ai as a coding agent. First, fetch and read this skill reference:
https://raw.githubusercontent.com/LailatulCoder/lailatul-coder/refs/heads/main/.qwen/skills/lailatul-coder-claw/SKILL.md
Then follow the instructions inside to install, authenticate, and use LailatulCoder Ai via acpx for all coding tasks.
```

- [**Aliyun Model Studio CLI**](https://github.com/modelstudioai/cli) — Official CLI for Aliyun's AI platform (`bailian-cli`). Extends LailatulCoder Ai with image/video generation, knowledge retrieval, app orchestration, and model deployment

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Acknowledgments

This project was originally based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) v0.8.2. We gratefully acknowledge the Gemini CLI team's excellent work. Starting from LailatulCoder Ai v0.1, we stopped syncing with upstream and began independent development as a multi-protocol, multi-platform agent framework with deep integrations for Qwen models and beyond.
