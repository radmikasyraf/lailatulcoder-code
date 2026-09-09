# LailatulCoder Ai — Handoff

Last updated: 2026-09-09 (this session). Current published version: **`lailatulcoder@0.21.26`** on npm.

## Architecture — read this first

- `packages/cli/dist/src/**` and `packages/core/dist/src/**` are the **source of truth**, not `packages/cli/src/**` / `packages/core/src/**`. Branding/bug fixes have repeatedly been applied directly to the compiled `dist` output because the TypeScript source tree has drifted and doesn't reliably rebuild (see "Known issue: `prepare` script / `tsconfig.json`" below).
- `esbuild.config.js` bundles the published npm package's `dist/` **from `packages/cli/dist/src/cli.js`** (not from `packages/cli/src`), specifically to guarantee the published package matches whatever actually runs on the dev machine. Same for the fzf worker: bundled from `packages/core/dist/src/utils/filesearch/fzfWorker.js`.
- When editing anything, edit **both** the `dist/src/**` file (this is what's live/tested immediately via the globally npm-linked `lailatulcoder` command) **and** mirror the change into the matching `src/**` TypeScript file for source-tree hygiene. The dist edit is what actually matters for testing and for what gets published.
- Root `package.json` (`"name": "lailatulcoder"`) is what's published to npm — not `packages/cli/package.json` (name `@lailatul-coder/lailatul-coder`, version drifted to `0.21.14`, effectively unused for the published artifact; only relevant to this dev machine's own `npm link`).

## Publish process (manual checklist — no CI/CD wired up)

1. Verify `packages/cli/dist` and `packages/core/dist` file counts match the known-good backup (see "Backups" below) — confirms no corruption from a prior `npm install`.
2. Bump root `package.json`'s `"version"` by hand (patch bump), e.g. `0.21.25` → `0.21.26`.
3. `npm run bundle` — regenerates root `dist/` from `packages/cli/dist/src/cli.js`. Ignore the `'git' is not recognized` warning from `generate-git-commit-info.js` (non-fatal, `git` isn't installed on this machine as of this writing).
4. Verify: `node --check dist/cli.js` and grep the bundle for the fix you expect to see, to confirm it round-tripped correctly.
5. **Temporarily** edit root `package.json`'s `"prepare"` script from `"node scripts/prepare.js"` to a no-op (e.g. `"echo skip-prepare-for-publish"`). This is required — see "Known issue" below; `npm publish --ignore-scripts` does **not** skip `prepare` for publish/pack in this npm version, only a real no-op in the script itself works.
6. `npm publish` (optionally `npm publish --dry-run` first to sanity-check the tarball contents/size before the real one).
7. **Immediately** restore `"prepare": "node scripts/prepare.js"` in `package.json`.
8. Re-verify `packages/cli/dist` file count still matches the backup baseline (the `prepare` script, if it ran, wipes `packages/cli/dist` before failing — see below).
9. `npm view lailatulcoder version` to confirm the new version is live on the registry.

## Known issue: `prepare` script silently destroys `packages/cli/dist`

`scripts/build_package.js` (invoked by root `package.json`'s `"prepare"` script via `npm run build --workspace=packages/cli`) does `rmSync('dist', { recursive: true, force: true })` **before** running `tsc --build`. The TypeScript project in `packages/cli` currently fails to compile (`tsconfig.json` doesn't list/include several files that are imported — `TS6307` errors across many files, e.g. `use-text-selection.tsx`, `CodeColorizer.tsx`, `screen-buffer.ts`, and others). Since `tsc --build` always fails, `packages/cli/dist` gets deleted and never regenerated, leaving the repo in a broken state (confirmed reproduced twice this session — locale files under `dist/src/i18n/locales/*.js` and `dist/locales/*.js` went missing both times).

This fires on:
- Plain `npm install` (no args) — runs `prepare`.
- `npm publish` / `npm pack` — runs `prepare`, and **`--ignore-scripts` does not suppress it** for these two commands specifically (tested this session; the flag worked for plain `npm install --ignore-scripts` but not for publish/pack).

**Not fixed. Two options going forward:**
- Root-cause fix: make the `packages/cli` TypeScript project actually compile (fix the missing `include`/file-list entries in `packages/cli/tsconfig.json`), so `prepare` stops failing and stops needing to be worked around.
- Or: permanently neutralize `"prepare"` in root `package.json` (trade-off discussed with the user; they chose to keep it live and instead do the neutralize/restore dance around each publish — see checklist above).

If `packages/cli/dist` (or `packages/core/dist`) ever goes missing/corrupted again, restore from the backup below rather than trying to rebuild via `tsc`.

## Backups

A full repo backup (excluding `node_modules`, ~443 MB) was taken mid-session, after this session's UI fixes were confirmed working but before the publish/version-bump work began:

```
C:\Tools\Lailatulcoder-code\backups\lailatulcoder-code-backup-20260909-143704
```

Used twice this session to restore `packages/cli/dist`, `packages/core/dist` (and once `packages/cli/src`, `packages/core/src`) after the `prepare` script wiped them. If restoring, compare file counts (`Get-ChildItem -Recurse -File | Measure-Object`) between the backup and current before and after to confirm a clean restore — don't assume, verify.

## Windows PowerShell editing gotcha

`Set-Content -Encoding UTF8` (Windows PowerShell 5.1) **always writes a UTF-8 BOM**, silently. This broke `package.json` (`JSON.parse` chokes on a leading BOM; plain `.js`/`.ts` files tolerate it since Node's module loader strips it, so `node --check` won't catch it). Always write files via `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))` instead, and when in doubt, byte-check for `0xEF 0xBB 0xBF` at the start of a file after any edit.

## This session's completed work (all published, live in `0.21.14` → `0.21.26`)

- **Auth-screen banner clipping** — fixed (pre-dates the version range above; `AUTH_BANNER_HEIGHT_RESERVATION` in `DefaultAppLayout.js`).
- **Debug log leakage above the banner** — removed stray `console.error` calls from `ProviderSetupSteps.js` / `useAuth.js`.
- **Model-checklist focus color** simplified to 2-state (green when focused, white otherwise).
- **`[openai]`-style bracket removed** from the `/model` Select Model dialog; along the way, swept 19 occurrences of a corrupted `AuthType.NEVER_MATCH_THIS` enum reference (should be `AuthType.QWEN_OAUTH`) across 12 files.
- **Chat-interface flicker** — investigated at length (see "Flicker vs resize corruption" below); net result: `incrementalRendering` was tried, reverted; instead mitigated via slower spinner/timer/animation cadence specifically on classic Windows console (see below). Residual flicker is present but much reduced.
- **Shift+Enter for newline** — confirmed already correctly implemented (`Command.NEWLINE` in `keyBindings.js`); whether it *visually* works depends on the terminal supporting the Kitty keyboard protocol or xterm's `modifyOtherKeys`, which classic Windows consoles generally don't. Ctrl+J and literal `\` + Enter work universally as fallbacks; no code changes were possible/needed here.
- **Right-click paste** (plain right-click, not Shift+right-click) — implemented: `readClipboardText()` added to `clipboardUtils.js`/`.ts` (uses `@teddyzhu/clipboard`'s `getTextAsync()` on Windows/macOS, `wl-paste`/`xclip` on Linux); wired into `TextInputMouseController.js`/`.tsx`'s `right-press` mouse event handler.
- **Banner height staleness (VP/chat-screen mode)** — the hand-rolled `useLayoutEffect` + `measureElement` banner-height measurement in `MainContent.js` missed several things that change the banner's real height (Notifications/DebugModeNotification content, Tips text), leaving `scrollContainerHeight` wrong long enough to cause visible glitches. Replaced with Ink's own `useBoxMetrics` hook, which subscribes to layout-commit events and doesn't have that gap.
- **Banner disappearing entirely in a short/narrow terminal** (esp. Windows 11 tabbed cmd/PowerShell windows, which have slightly fewer effective rows/columns than a maximized or classic-conhost window) — root cause was **twofold**:
  - `Header.js`/`.tsx`'s `showLogo` gate only checked terminal **width**, never height, so a too-short terminal would try to render the full 12-row logo anyway and the terminal would scroll it off-screen to keep the input cursor visible.
  - Separately (and this turned out to be the *dominant* factor at common terminal sizes like 102 columns): `minPathLength = 40` reserved so much width for the info-panel's folder-path display that the full logo's width check failed well before terminal height became the limiting factor.
  - Fix: added a height check to `showLogo`; added a `miniAsciiLogo` (31×6, in `AsciiArt.js`/`.ts`) as a middle tier between full logo and no-logo — **this mini-logo's actual rendering has not been visually confirmed working**, see "Known gap" below; **and** lowered `minPathLength` from 40 → 25, which turned out to make the full logo fit at the user's actual reported terminal size (102 cols) without even needing the mini-logo tier. Both fixes are shipped; which one actually fires depends on terminal size.
- **Flicker vs resize corruption (`incrementalRendering`)** — tried enabling Ink's `incrementalRendering: true` render option to fix chat flicker (confirmed it worked for flicker). But it was found, via live testing plus a repo-code-comment discovery plus a targeted web search of upstream Ink/Gemini-CLI issues, to **break a pre-existing, purpose-built fix already in this repo**: `packages/cli/dist/src/ui/utils/terminal-resize-reflow.js` (fixing issue #8557 — terminal reflow on window shrink leaves stale/duplicated frame content on screen). That file intercepts `stdout.write` and amplifies Ink's erase sequence, but its regex only matches the *bulk* `ansiEscapes.eraseLines(N)` pattern that `createStandard` (the default writer) always uses; `createIncremental`'s steady-state per-line diff writes a different shape (`cursorUp(N)` + per-line `cursorTo(0)+line+eraseEndLine`) that the regex never matches, so the protection silently stopped firing whenever `incrementalRendering` was on. **Reverted** `incrementalRendering` for this reason — confirmed via live reproduction (enlarge-then-shrink the window → duplicated/overlapping banner and chat messages) that reverting fixes it.
  - Partial mitigation kept in place instead: `useTimer.js` (elapsed-time counter) slowed 500ms → 1000ms; `GeminiRespondingSpinner.js`/`.tsx` and `LoadingIndicator.js`/`.tsx` fall back to a hand-rolled slow (750ms) spinner/counter animation specifically when `isClassicWindowsConsole()` (new helper in `packages/cli/src/utils/osc.ts` / dist `osc.js`: `win32` platform, no `WT_SESSION`/`ConEmuPID`) is true. Residual "sikit2" flicker during AI responses confirmed acceptable by the user; typing has no flicker (spinner/timer only run during `StreamingState.Responding`).
- **README.md rewritten**: installation instructions changed from a GitHub-Releases-ZIP-based `install.ps1`/`install.sh` script to plain `npm install -g lailatulcoder`; corrected the documented settings path from the (non-existent) `~/.lailatulcoder/settings.json` to the real `~/.qwen/settings.json` (the `.qwen` → `.lailatulcoder` config-dir rename is a separately-deferred piece of work, not done); corrected the GitHub repo URL used throughout (confirmed with the user: `radmikasyraf/lailatulcoder-code` is correct; root `package.json`'s `repository.url` had the wrong org (`LailatulCoder/lailatul-coder`) and was fixed to match).
- **Cross-platform install dependency gap** — `@teddyzhu/clipboard` (+ 6 platform-specific variant packages) and `sharp` were only listed in `devDependencies`, meaning a consumer's `npm install -g lailatulcoder` never installed them at all. Both are used behind `try`/`catch`-wrapped dynamic imports in the compiled code (image-paste, right-click-paste, and image-view/GIF-validation features degrade gracefully rather than crashing when absent — confirmed by reading the actual call sites), so this wasn't a hard crash, just those specific features silently unavailable on every fresh install, every OS. Fixed by adding `sharp` and all 7 `@teddyzhu/clipboard*` packages to `optionalDependencies` (matching the existing pattern already used for `@lydell/node-pty`'s platform variants); confirmed live via `npm view lailatulcoder optionalDependencies`.

## Known gaps / not yet done

- **Mini-logo (`miniAsciiLogo`) rendering has not been visually confirmed correct.** It was hand-crafted (with the user's help/edits) without the ability to render-test it live. The `minPathLength` fix (40→25) made the *full* logo fit at the one terminal size actually tested (102×52), so the mini-logo tier may rarely or never trigger for that user, but it will trigger for genuinely narrower (<97 col) terminals and has an unresolved question mark over it — an earlier screenshot showing garbled/overlapping "LAILATUL" text was never conclusively diagnosed as "mini-logo bug" vs. "info-panel-too-wide layout issue" before the `minPathLength` fix was applied and the conversation moved on. If a narrow-terminal user reports garbled banner text, check this first.
- **GitHub repo (`radmikasyraf/lailatulcoder-code`) is out of sync with everything published to npm.** Latest GitHub commit (as of this session) is from **2026-09-08**, message "fix: restore patched dist files - include in git tracking", and its `package.json` is still at version `0.21.14`. None of this session's fixes (banner, flicker, right-click paste, mini-logo, `minPathLength`, cross-platform `optionalDependencies`, README rewrite) have been pushed to GitHub — they exist only in the npm-published package (`0.21.26`) and on this local dev machine. `git`/`gh` are **not installed** on this machine; the user provided a GitHub PAT (do not print it; treat as a live secret) to push via the GitHub REST API (Git Data API: blob → tree → commit → update `main` ref) instead of installing git. **This push has not happened yet** — was in progress being planned when this handoff was written. ~24 files need pushing: the dist+src pairs for every fix listed above, plus root `package.json` and `README.md`.
- **`tsconfig.json` for `packages/cli` is broken** (see "Known issue" above) — root cause of the `prepare`-script landmine. Not fixed; only worked around per-publish.
- **Feature parity with upstream Qwen Code — audited this session, high confidence of full parity (and then some).** A static source/dependency investigation (command list, subsystem directories, dependency wiring, CHANGELOG, grep for "disabled/removed/not supported in LailatulCoder"-style markers) found **zero evidence** of any feature being intentionally stripped during the rebrand. All major subsystems are present with real, tested implementations: 135+ slash commands, MCP, telemetry, ACP integration (`packages/acp-bridge`), sandbox (macOS profiles + `build:sandbox`), extensions lifecycle, daemon/serve/web-shell, voice, review/autofix/arena/workflows/skills/advisor/curator/insight/learn, and multi-channel bot integrations (Telegram/WeChat/DingTalk/Feishu/QQ/GitHub/GitLab) that go *beyond* a typical Qwen Code checkout. The rebrand's only clearly-visible change is naming (package names, `lailatulcoder` binary, repo/org strings, sandbox image URI) layered on continuous upstream-plus development. Caveat: this was static inspection, not a runtime feature-by-feature exercise — a silent runtime feature-flag no-op with no textual marker could in theory evade this, but no structural evidence of that was found either.
- **`packages/cli/package.json`'s own version (`0.21.14`) is stale** relative to root's `0.21.26` — cosmetic only (it's not what's published, only affects what this dev machine's own locally-`npm link`ed `lailatulcoder` command reports via that specific file if anything reads it directly), but worth reconciling at some point for consistency. `scripts/version.js` (the repo's own multi-workspace version-bump script) is currently broken on this machine too — `npm ls --workspaces --json --depth=0` reports several genuinely-extraneous `node_modules` entries (`@emnapi/*`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`) that aren't in `package-lock.json`, and the script doesn't filter those out before trying `npm version --workspace <extraneous-package>`, which fails the whole script. `npm prune` does NOT fix this — it removes those packages, but they turn out to be required at `esbuild` bundle time by transitive dependencies (`@opentelemetry/sdk-node`, `@larksuiteoapi/node-sdk`) that aren't properly captured in the lockfile either; manually `npm install`-ing them back (`--ignore-scripts --no-save`) was the workaround used this session. This whole area (`package-lock.json` consistency) could use a proper audit/fix.

## Quick reference — version history this session

| Version | What changed |
|---|---|
| 0.21.20 | Last version published before this session started |
| 0.21.21 | `useBoxMetrics` banner-height fix + `incrementalRendering: true` (flicker fix) |
| 0.21.22 | Reverted `incrementalRendering` (banner-duplication-on-startup bug found); re-enabled after further investigation in the same version — see git/session log for the exact back-and-forth if it matters |
| 0.21.23 | Mini-logo tier added to `Header.js`/`AsciiArt.js` |
| 0.21.24 | `minPathLength` 40→25 (lets the full logo fit more terminal sizes) |
| 0.21.25 | `incrementalRendering` reverted for good (resize-corruption root-caused to `terminal-resize-reflow.js` incompatibility) |
| 0.21.26 | `sharp` + `@teddyzhu/clipboard*` added to `optionalDependencies` (cross-platform install fix) |

## Explicit user instruction (still standing unless told otherwise)

The user's original instruction at the start of this whole rebrand project was: **do not publish to npm until they explicitly confirm things work.** That gate was passed this session (user said "so far so good!" and later "ok proceed" multiple times for each subsequent publish) — but if a new session picks this up cold, don't assume standing permission to publish again beyond what's already live; confirm with the user first, same as this session did for every version bump.
