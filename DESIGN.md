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

Only four public commands:

```text
bpw doctor
bpw start
bpw status
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

### `stop`

- stop only a proven BPW-owned source server;
- clear BPW session files;
- leave Cent/browser/tab alone.

## 3. Configuration

Keep the existing public `workbench.config.json` as defaults.

Precedence for V0.2:

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

## 8. Skill

The future `browser-plugin-workbench` Skill should be thin:

1. run `bpw doctor`;
2. run `bpw start --source ... --url ...`;
3. use returned CDP/session with `agent-browser` directly;
4. AI diagnoses, edits, reloads, inspects, and verifies;
5. run `bpw stop` when done.

The Skill does not contain a duplicate BPW implementation.

