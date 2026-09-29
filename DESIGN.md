# Browser Plugin Workbench — Lean Design

Status: Approved

## 1. Smallest viable shape

```text
AI / Skill
    |
    v
 bpw CLI
    |
    +-- Userscript loader generator
    +-- loopback source server
    +-- small session state
    |
    +--> cent-cdp-browser --> Cent + daily profile + CDP
    |
    +--> agent-browser --> dedicated pinned tab
```

BPW stops at the environment boundary. After `start`, AI talks to `agent-browser` directly.

## 2. CLI

Only five public commands:

```text
bpw doctor
bpw start
bpw status
bpw finish
bpw stop
```

Use Node built-ins. Do not add a CLI framework unless a concrete need appears.

### `doctor`

Read-only checks for the mechanical prerequisites BPW depends on:

- config/source readable;
- loopback server config sane;
- Node/npx/Python/PowerShell available where relevant;
- `cent-cdp-browser` configured when a real Cent start is expected.

Do not install dependencies or mutate the machine.

### `start`

1. Resolve source/URL from CLI flags over config.
2. Generate dev loader from the real source.
3. Start or safely reuse the BPW source server.
4. Invoke existing browser bootstrap.
5. Create/pin the dedicated `agent-browser` session/tab.
6. Write minimal session state.
7. Print the values AI needs to continue directly.

### `status`

Report only facts BPW owns:

- configured/current source;
- local server identity/health;
- saved CDP/session information;
- whether CDP endpoint is reachable.

Do not inspect DOM/Console/Network.

### `finish`

- verify the formal Userscript identity/source contract;
- promote the current real source into the selected Userscript manager;
- enable the formal script and disable/remove the BPW-created dev loader as appropriate;
- refresh the dedicated target;
- stop the BPW-owned source server and clear session state;
- refuse unsafe overwrite if the formal script changed outside BPW during the session.

### `stop`

- restore the selected Userscript manager to its pre-debug state;
- stop only a proven BPW-owned source server;
- clear BPW session files;
- leave Cent/browser/profile alone.

## 3. Configuration

Keep the existing public `workbench.config.json` as defaults.

Precedence for V0.2.1:

```text
CLI --source / --url
> BPW_* environment override
> workbench.config.json
```

Do not add schema frameworks.

Useful environment values may include:

```text
BPW_SOURCE
BPW_TARGET_URL
BPW_DEV_PORT
BPW_CDP_PORT
BPW_AGENT_SESSION
BPW_USERSCRIPT_MANAGER
CENT_CDP_SKILL
```

## 4. Reuse existing V0.1 code

Do not rewrite working behavior.

- `generate-userscript-loader.js`: keep and make config/env aware.
- `dev-server.js`: keep and add server identity.
- `dev-server-control.js`: keep and fix ownership/reuse safety.
- `start-browser.ps1`: keep as thin `cent-cdp-browser` + `agent-browser` bridge.
- `verify-browser.ps1`: keep only as an internal regression helper; it is not a public `bpw verify` product command.

## 5. Source server ownership

This is one area BPW must own because a mistake can kill the wrong process.

`/healthz` should identify at least:

```json
{
  "ok": true,
  "app": "browser-plugin-workbench",
  "pid": 1234,
  "source": "D:\\...\\foo.user.js"
}
```

Rules:

- reuse only when `app` matches and the source matches the requested source;
- persist PID plus expected source/port as BPW-owned state;
- before killing, query health and require PID/app/source to match;
- stale/mismatched state is reported and removed or left safe, never used for blind `process.kill`.

## 6. Loader behavior

Keep metadata inheritance already proven by My Prompt.

Keep:

- inherited execution metadata;
- isolated dev name/namespace/version;
- removal of update/download URLs;
- loopback `@connect`;
- Violentmonkey content injection;
- Tampermonkey DOM sandbox declaration.

When the local server is intentionally down, connection failure should be silent. `bpw start/status` is the diagnostic source for server availability.

## 7. No product abstractions yet

Do not introduce `core/`, `providers/`, `adapters/`, registries, plugin interfaces, or generic backend abstractions merely because future browsers/managers may exist.

Split files only when current code becomes hard to maintain.

## 8. Userscript manager lifecycle

- Violentmonkey: use the proven background API path; never fall back to management-page UI automation.
- Tampermonkey: use the internal Fast API path (`loadTree`, `saveScript`, `modifyScriptOptions`, `purgeScripts`) through the extension page context.
- `finish` promotes current source; `stop` restores the pre-debug state.
- `--manual-loader` remains an explicit compatibility mode and does not support automatic `finish` promotion.

## 9. Skill

The `browser-plugin-workbench` Skill should stay thin:

1. run `bpw doctor`;
2. prefer request JSON and run `bpw start --request ...` for AI/Codex; keep direct `--source/--url` for human terminals;
3. use returned CDP/session with `agent-browser` directly;
4. AI diagnoses, edits, reloads, inspects, and verifies;
5. run `bpw finish` after successful verification, or `bpw stop` to abandon/restore.

The Skill does not contain a duplicate BPW implementation.
Its canonical source lives in this repository under `skills/browser-plugin-workbench/`; local multi-agent skill folders are deployment/sync mirrors, not an independent source of truth.

