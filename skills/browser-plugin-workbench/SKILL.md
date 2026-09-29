---
name: browser-plugin-workbench
description: Use Browser Plugin Workbench (BPW) to prepare, run, finish, or restore a real local Userscript development environment for AI. Trigger when an existing .user.js needs real-browser debugging with Cent/Chromium + CDP, Violentmonkey, or Tampermonkey; when BPW CLI availability/install must be checked; or when the AI needs the correct BPW + agent-browser workflow. BPW is only the thin environment/lifecycle bridge; after start, use agent-browser directly for DOM, Console, Network, reload, click, eval, screenshots, and task-specific verification.
---

# Browser Plugin Workbench

Use BPW as a **thin environment and Userscript-lifecycle bridge**, not as the debugger or reasoning engine.

## Core rule

AI owns diagnosis, planning, source edits, and verification strategy.

BPW owns only mechanical local work:

- Userscript dev-loader generation;
- loopback source server;
- Cent/CDP bootstrap via `cent-cdp-browser`;
- dedicated target/session binding;
- supported Userscript-manager lifecycle;
- BPW-owned cleanup/restoration.

Do not ask BPW to wrap capabilities that `agent-browser` already provides.

## Runtime bootstrap

### Local Codex or local worker/Pi on Windows

1. Check whether BPW is on `PATH`:

```bat
where.exe bpw
```

2. If found, run:

```bat
bpw doctor
```

3. If missing during normal use, install the pinned stable release:

```bat
npm install -g github:moshouhot/browser-plugin-workbench#v0.2.1
```

Do not install from `main` by default. No npm Registry package is currently published.

If the task is specifically developing BPW itself, use the source checkout and `npm link` instead.

4. Verify again with `where.exe bpw` and `bpw doctor`.

If `bpw doctor` reports missing local prerequisites such as `cent-cdp-browser`, repair/report that prerequisite instead of bypassing BPW.

### Web / Cloud Codex

Do not install BPW in the cloud and pretend it can control the user's local Cent/Profile/CDP.

Keep diagnosis, edits, planning, and acceptance with the current AI. Delegate only the local browser/CDP portion to an available local execution channel/worker. When `codex-pi-delegate` / `coding-tools-mcp` is available, prefer that bounded local route.

### Pi used directly

Pi does not need to discover this Skill itself. Give Pi the bounded local task and have it run the same preflight: `where.exe bpw` -> install/link if missing -> `bpw doctor`.

## Default workflow

1. Identify the real `.user.js` source and target URL.
2. Run `bpw doctor`.
3. For AI/Codex, create a temporary request JSON:

```json
{
  "source": "C:\\path\\to\\script.user.js",
  "url": "https://target.example/",
  "manager": "violentmonkey"
}
```

Use `"manager": "tampermonkey"` for Tampermonkey.

4. Start with:

```text
bpw start --request "<request json path>"
```

For policy-controlled agents, prefer request JSON instead of placing a literal URL in the command line. The direct `--source` / `--url` form remains fine for a human terminal.

5. Read the returned values, especially `source`, `devServer`, `cdpPort`, `targetId`, `targetCdpUrl`, `agentSession`, `loader`, and selected `manager`.
6. Use `agent-browser` **directly** with the returned target/CDP/session.
7. Inspect only what the current bug requires: DOM, Console, Network, JS state, screenshots, etc.
8. Edit the original source file, never the generated dev loader.
9. Reload and verify with `agent-browser` using task-specific judgment.
10. If verification passes, run:

```text
bpw finish
```

`finish` promotes the current source into the selected Userscript manager, restores the formal/dev lifecycle, refreshes the target, stops the BPW source server, and clears BPW session state. It must refuse unsafe overwrite if the formal script changed externally during the session.

11. If the work should be abandoned or only the pre-debug manager state should be restored, run:

```text
bpw stop
```

12. Confirm the BPW source server stopped while the user's normal browser remains running.

## Public BPW commands

Treat these as the intended public surface:

```text
bpw doctor
bpw start
bpw status
bpw finish
bpw stop
```

Do not invent `bpw inspect`, `bpw console`, `bpw network`, `bpw screenshot`, or generic `bpw verify` wrappers.

## Userscript manager lifecycle

### Violentmonkey

Use BPW's proven background-API lifecycle. If the background API is unavailable, fail closed. Do not fall back to management-page UI automation.

### Tampermonkey

Use BPW's internal Fast API lifecycle through the Tampermonkey extension page context:

- list: `loadTree("options.scripts.userscripts")`;
- read source: `loadTree("options.scripts.userscripts.source", uuid)`;
- update/create: `saveScript`;
- enabled state: `modifyScriptOptions`;
- delete: trash via `saveScript(uuid)`, then `purgeScripts`.

BPW no longer requires Tampermonkey Editors, External `userscripts` API, or a WebSocket bridge. Fast operations must verify exact identity and post-write state; failures are fail-closed.

### Manual compatibility mode

`--manual-loader` is only for unsupported managers or intentionally manual workflows. It does not support automatic `bpw finish` promotion.

## Real-source rule

The external `.user.js` is the source of truth. Never edit the generated `WorkbenchDev.user.js` as business source.

## Browser/tool reuse

Prefer existing tools:

- `cent-cdp-browser` for the real Cent/Profile/CDP environment;
- `agent-browser` for browser interaction and observation;
- Violentmonkey/Tampermonkey as Userscript runtimes.

If the project already uses a mature Userscript build system such as `vite-plugin-monkey`, keep it. BPW bridges the environment; it does not replace the project's build system.

## Strict-CSP sites

Do not weaken browser/site security. Use the BPW-generated loader path that preserves Userscript sandbox/content-context execution. Treat the old page-context CSP/EvalError behavior as a regression.

## Failure handling

- Missing BPW/`cent-cdp-browser`: fix/report the prerequisite instead of bypassing the workflow.
- `bpw start` mechanical failure: inspect that error first; do not add product features reflexively.
- Codex command blocked before BPW executes: use `bpw start --request ...` instead of changing sandbox policy or retrying a literal-URL command.
- Port occupied by another process: do not reuse or kill it blindly.
- Ambiguous target/browser evidence: inspect the pinned target with `agent-browser`, not a new BPW abstraction.
- Manager backend unavailable or identity check fails: fail closed; never fall back to Userscript-manager UI automation.

## Completion

A browser-plugin task is complete only after the AI verifies the requested behavior in the real target environment and then:

- runs `bpw finish` for an accepted change, or
- runs `bpw stop` to abandon/restore.

Do not equate `bpw start` returning READY with the user's bug being fixed.
