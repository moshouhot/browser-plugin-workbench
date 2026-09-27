# Browser Plugin Workbench — Product Requirements Document

Status: Approved — 2026-09-27  
Product: Browser Plugin Workbench (BPW)  
Repository: `moshouhot/browser-plugin-workbench`  
Current milestone: V0.2 implementation-ready  

## 1. Product statement

Browser Plugin Workbench is a local-first development workbench for AI-assisted browser plugin development.

Its job is not to replace mature Userscript bundlers, browser-extension frameworks, or CDP automation tools. Its job is to connect them into one repeatable development loop:

```text
real source code
-> development adapter
-> real daily browser/profile
-> real target website
-> CDP observation/action
-> AI or human edits
-> reload
-> evidence-based verification
```

The product must remain useful without an AI. AI integrations are adapters on top of the workbench, not the workbench itself.

## 2. Why this project exists

Modern browser-plugin development already has good point solutions:

- Userscript build/dev: `vite-plugin-monkey`, `webpack-monkey`.
- Browser extensions: WXT, Extension.js, Plasmo, CRXJS.
- Browser/CDP automation: `agent-browser`, `cdp-browser`, Playwright/Puppeteer-class tools.
- Real-profile agent control: several CDP/bridge projects already focus on connecting agents to a logged-in browser.

The missing piece for our use case is a simple workbench that:

1. Works directly against an existing real project instead of forcing migration first.
2. Uses the user's real, logged-in browser/profile and installed extensions.
3. Lets AI inspect real DOM, Console, Network, screenshots, and page state.
4. Keeps the target tab isolated so the AI cannot accidentally validate the wrong page.
5. Turns development into a stable start -> inspect -> edit -> reload -> verify -> stop loop.
6. Produces evidence before reporting PASS.
7. Can later support both Userscripts and Chrome Extensions through adapters.

## 3. Product principles

### P1. Orchestrate; do not reinvent

Prefer mature projects for specialized capabilities:

- Do not build another Vite/Webpack replacement.
- Do not implement raw CDP unless an existing CLI cannot expose the required capability.
- Do not create another Chrome Extension framework.
- Do not fork Violentmonkey/Tampermonkey to obtain a development workflow.

BPW owns orchestration, lifecycle, target isolation, compatibility glue, evidence, and AI-facing contracts.

### P2. Existing projects first

The first-class workflow must be:

```text
point BPW at an existing .user.js or extension project
-> start workbench
-> debug it
```

`bpw init` may create example projects later, but users must not be forced to reorganize an existing project just to use the workbench.

### P3. One source of truth

The original project file remains the source of truth.

For Userscripts, BPW must not require a duplicate development copy of the script. The dev loader may be generated, but business code stays in the original `.user.js`.

### P4. Real browser over synthetic browser by default

For interactive debugging, prefer the user's real browser session when explicitly configured:

- existing login state;
- cookies;
- Userscript manager;
- extensions;
- bookmarks/site settings where relevant.

Managed clean browsers remain useful for CI or reproducible tests later, but are not the primary local-debugging experience.

### P5. Evidence before PASS

"Browser started" is not PASS.

"CDP port responds" is not PASS.

"Script downloaded" is not PASS.

PASS requires observable target-specific evidence.

### P6. MVP before framework complexity

No GUI, database, daemon architecture, plugin marketplace, cloud backend, or custom protocol until the CLI workflow proves the need.

## 4. Research references and what BPW should learn from them

### 4.1 vite-plugin-monkey

Repository: `lisonge/vite-plugin-monkey`

What to learn:

- Userscript metadata generation.
- GM API ergonomics.
- `@require` / `@resource` handling.
- TypeScript and modern bundling integration.
- Development script installation flow.

What not to copy blindly:

- Vite development mode can run into CSP constraints on strict sites.
- BPW must support existing plain `.user.js` projects without requiring a Vite migration.

### 4.2 webpack-monkey

Repository: `guansss/webpack-monkey`

What to learn:

- Userscript-focused HMR.
- Meta generation.
- Handling external dependencies/assets.
- CSP-aware execution inside Userscript scope.

Important lesson:

Strict-CSP pages are not an edge case. BPW must treat CSP-safe Userscript execution as a core compatibility requirement.

### 4.3 WXT

Repository: `wxt-dev/wxt`

What to learn:

- Strong developer experience.
- File-based extension entrypoints.
- Dev mode and reload behavior.
- Multi-browser architecture.
- Clear separation of framework core and browser target.

BPW position:

Do not compete with WXT as an extension framework. When Chrome Extension support is implemented, BPW should be able to drive and verify WXT projects.

### 4.4 Extension.js

Repository: `extension-js/extension.js`

What to learn:

- One CLI for development lifecycle.
- Existing extension projects can be adopted with low migration cost.
- Targeted content-script/service-worker reload.
- Ability to select a custom browser binary.
- Build/dev/preview commands that feel like normal developer tooling.

### 4.5 Plasmo / CRXJS

Repositories: `PlasmoHQ/plasmo`, `crxjs/chrome-extension-tools`

What to learn:

- HMR and reload expectations for modern extension development.
- Framework integration patterns.
- Extension-specific build complexity should remain outside BPW core whenever possible.

### 4.6 agent-browser

Repository: `vercel-labs/agent-browser`

What to learn:

- Stable command surface designed for AI agents.
- Existing-browser CDP attach.
- Snapshots, tabs, JS, screenshots, Console/Network operations.
- Skill-based integration with coding agents.

BPW position:

Use `agent-browser` as a browser-control backend where practical instead of reimplementing its capabilities.

### 4.7 cdp-browser and similar CDP CLIs

Repository example: `sids/cdp-browser`

What to learn:

- `watch` style Console/Network capture.
- Artifacts and screenshots as normal CLI output.
- Debugger-oriented commands rather than only browser automation commands.

### 4.8 real-profile browser agent projects

Examples include `cdp-agent-kit`, browser bridge/operator projects, and local-first CDP workbenches.

What to learn:

- Reusing a logged-in profile is valuable.
- Scope control matters because raw CDP can see the whole browser.
- An agent should be pinned to a known target/tab instead of implicitly using whichever tab is active.
- Human-visible/browser-visible operation is preferable for debugging workflows.

## 5. Primary users

### Persona A — AI-assisted Userscript maintainer

Has an existing `.user.js`, often large and not organized as a modern Vite project.

Needs:

- edit original source;
- refresh real site;
- inspect current DOM;
- debug site updates/selectors;
- preserve GM APIs/resources;
- test strict-CSP sites;
- obtain evidence that a fix really works.

### Persona B — AI coding agent

Needs a predictable CLI and machine-readable state instead of ad-hoc shell snippets.

Needs:

- discover environment;
- start a bounded session;
- know exactly which target it controls;
- inspect/act/reload;
- collect errors/evidence;
- clean up after itself.

### Persona C — Chrome Extension maintainer (future)

Has an existing MV3 extension, possibly using WXT, Extension.js, Plasmo, CRXJS, or no framework.

Needs the same browser/evidence loop without BPW replacing the extension framework.

## 6. Supported scope

### V0.2 official scope

- OS: Windows first.
- Browser class: Chromium/CDP.
- Primary proven browser: Cent Browser.
- Userscript manager: Violentmonkey proven; Tampermonkey compatibility path retained but not yet claimed as live-verified.
- Source type: existing `.user.js`.
- Browser control backend: `agent-browser` + CDP.
- Local source server: loopback only.
- AI integration: CLI-first; Skill wrapper later.

### Architecturally supported, not yet acceptance-tested

- Chrome / Edge / other Chromium browsers.
- Tampermonkey.
- ScriptCat / Greasemonkey-class managers.

### Reserved

- Chrome Extension development.
- Firefox/WebDriver.
- Headless/CI mode.
- Remote browser service.
- MCP server.
- GUI.

## 7. Core user journey — Userscript

Target experience:

```text
bpw start --source "D:\project\foo.user.js" --url "https://target.example/"

READY
session: bpw-...
source: D:\project\foo.user.js
manager: Violentmonkey
browser: Cent
cdp: 9222
target: https://target.example/...
loader: enabled
```

Developer or AI edits the original script.

```text
bpw reload
bpw inspect
bpw console
bpw verify
```

Finish:

```text
bpw stop
```

Expected cleanup:

- development loader disabled;
- local dev server stopped;
- workbench state closed;
- normal browser/profile remains usable;
- no source copy left behind.

## 8. CLI product surface

V0.2 should converge on one `bpw` command rather than expose implementation scripts as the public interface.

### Required commands

#### `bpw doctor`

Checks:

- Node/runtime;
- configured browser/CDP provider;
- `agent-browser` availability;
- Userscript manager detection where possible;
- loopback port availability;
- source readability;
- current browser/CDP state.

Must never modify the system merely to report health.

#### `bpw start`

Responsibilities:

1. Read project/config.
2. Validate source metadata.
3. Generate or refresh dev loader.
4. Start/reuse local source server.
5. Start/reuse configured CDP browser provider.
6. Create a dedicated target tab.
7. Pin the automation session to that tab.
8. Enable/install dev loader when supported by the adapter.
9. Persist session state.
10. Return machine-readable READY state.

#### `bpw status`

Must report current session truth rather than infer success from stale PID files.

#### `bpw reload`

Reloads only the pinned workbench target.

#### `bpw inspect`

Returns a compact page observation suitable for AI:

- URL/title;
- DOM snapshot;
- selected high-value page metadata;
- relevant script markers;
- recent errors.

The first version can wrap `agent-browser snapshot` instead of inventing a new DOM format.

#### `bpw console`

Returns current/recent Console output, with optional error-only mode.

#### `bpw network`

Returns recent requests/failures for the pinned target when backend support is available.

#### `bpw verify`

Runs explicit acceptance checks.

It must support generic checks such as:

- selector exists/count;
- text exists;
- JS predicate returns true;
- no relevant Console errors;
- URL/host matches target;
- local source was actually requested after the last reload.

#### `bpw stop`

Disables development state and stops owned services without killing unrelated browser processes.

## 9. Configuration model

Keep configuration small.

Recommended shape:

```json
{
  "targetUrl": "https://example.com/",
  "source": {
    "type": "userscript",
    "path": "D:\\project\\foo.user.js"
  },
  "browser": {
    "provider": "cent-cdp",
    "preferredPort": 9222
  },
  "userscript": {
    "manager": "auto",
    "metadataMode": "inherit"
  }
}
```

Rules:

- CLI flags override config.
- Environment variables are for machine-specific paths/providers.
- Public project config must not contain machine-specific absolute tool paths.
- Session/runtime state must not be committed.

## 10. Userscript adapter requirements

### US-1 External source

Must accept an existing `.user.js` outside the BPW repository.

### US-2 Metadata inheritance

Dev loader should preserve required metadata including, when present:

- `@match` / `@include`;
- `@grant`;
- `@require`;
- `@resource`;
- `@connect`;
- `@run-at`;
- other execution-related metadata proven necessary.

### US-3 Development identity isolation

Dev loader must use a distinct development name/namespace/version identity so it does not overwrite the normal installed script.

### US-4 Disable production update behavior

Development loader must not retain update/download metadata that can unexpectedly replace the local development entry.

### US-5 Strict-CSP compatibility

Strict-CSP sites are a required test class.

Current proven approach:

- Violentmonkey: content-context injection.
- Tampermonkey: DOM sandbox declaration.

Do not solve CSP by globally disabling site security.

### US-6 Dev loader lifecycle

V0.2 goal:

- detect whether the BPW dev loader is installed;
- enable it for a session;
- disable it on stop.

Initial installation may remain a one-time human-visible operation if automatic installation becomes brittle or depends on private extension internals.

### US-7 Source-server proof

BPW must be able to prove that the target reload fetched the current local source rather than merely observing old DOM left from a previous run.

Add a lightweight request/session marker to the dev server evidence.

## 11. Browser provider requirements

Browser management belongs behind a provider interface.

### Current provider: `cent-cdp`

May delegate to the local `cent-cdp-browser` Skill/tool.

Requirements:

- reuse daily profile when configured;
- local-only CDP endpoint;
- do not create a second instance against a locked profile;
- verify actual process/user-data arguments;
- safely reuse an existing valid CDP session;
- never kill unknown browser processes.

### Future provider: generic existing CDP

Accept:

```text
--cdp 9222
```

or a WebSocket endpoint and skip browser process management entirely.

This is important for portability and should arrive before adding many browser-specific launchers.

## 12. Target isolation

This is a core feature, not an implementation detail.

Requirements:

- every BPW session owns a specific target/tab;
- reload/inspect/verify act only on that target;
- closing the target should cause an explicit failure;
- never silently fall back to another open tab;
- session state records target URL and identity.

## 13. Evidence and acceptance

BPW must produce evidence in a machine-readable runtime directory.

Suggested V0.2 session artifacts:

```text
runtime/sessions/<session-id>/
├─ state.json
├─ source-requests.jsonl
├─ console.jsonl
├─ network.jsonl          # when supported
├─ verify.json
└─ screenshots/           # only when requested/needed
```

Do not log secrets or full sensitive form values by default.

### PASS contract

PASS requires all applicable checks:

1. Browser/CDP reachable.
2. Pinned target is the requested target.
3. Dev source request observed for current revision/session.
4. Userscript/extension-specific marker or explicit verification predicate passes.
5. No relevant blocking Console error remains.

Otherwise report FAIL or BLOCKED.

## 14. AI-facing contract

CLI human text is useful, but AI integrations need stable JSON.

Every core command should eventually support:

```text
bpw status --json
bpw inspect --json
bpw verify --json
```

JSON should contain:

- schema version;
- session id;
- command status;
- target identity;
- evidence paths;
- blocker/error code;
- concise human message.

The future Skill/MCP layer should mostly translate agent intent into these commands.

## 15. Chrome Extension adapter — reserved direction

Do not build another extension framework.

BPW should support three modes later:

### CE-A Raw/unpacked extension

Existing folder containing `manifest.json`.

BPW handles browser loading/reloading and verification.

### CE-B Framework-managed extension

Detect/adopt WXT, Extension.js, Plasmo, or CRXJS development output when practical.

BPW should call their documented dev/build commands rather than reproduce bundling/HMR.

### CE-C Existing installed extension

Debug an already installed dev extension when the user explicitly provides/authorizes it.

Future checks should include:

- extension pages;
- background/service worker Console;
- content script injection;
- manifest permissions;
- target-page effects.

## 16. Non-goals for V0.2

Explicitly not in scope:

- GUI dashboard.
- Cloud account/backend.
- Hosted browser fleet.
- Browser store publishing.
- Generic web scraping framework.
- Autonomous browsing agent/LLM built into BPW.
- Reimplementation of agent-browser.
- Full Playwright-style testing framework.
- Automatic CAPTCHA/Cloudflare bypass.
- Supporting every Userscript manager.
- Chrome Extension HMR framework.

## 17. Safety and privacy

The workbench can access a real logged-in browser, so safety must be designed in.

Requirements:

- bind local dev/CDP helper services to loopback by default;
- isolate AI commands to the workbench target wherever possible;
- no secret dumping in logs;
- unknown ports/processes are not killed automatically;
- development loader is disabled on normal stop;
- destructive browser actions are not part of `verify`;
- CAPTCHA/security challenges require legitimate human completion unless the site provides a normal programmatic path.

## 18. V0.2 implementation milestones

### M1 — Unified CLI

Deliver:

- `bpw doctor`
- `bpw start`
- `bpw status`
- `bpw reload`
- `bpw inspect`
- `bpw verify`
- `bpw stop`

Existing scripts become internal implementation details.

### M2 — Generic project configuration

- clean config schema;
- external source path;
- environment-variable machine configuration;
- session state versioning.

### M3 — Userscript lifecycle

- generate loader;
- local source request evidence;
- detect installed dev loader where feasible;
- enable/disable adapter for Violentmonkey where stable;
- keep first-install manual fallback.

### M4 — Better debugging evidence

- target snapshot;
- Console errors;
- optional Network failures;
- verification predicates;
- JSON output.

### M5 — Second real-project regression

Keep My Prompt as regression case and add at least one smaller Userscript on a different site/metadata profile.

### M6 — Chrome Extension discovery spike

No full implementation yet.

Produce a short comparison/prototype deciding whether the first Chrome Extension adapter should prefer:

- Extension.js integration;
- WXT integration;
- or framework-neutral unpacked-extension control.

Recommendation: framework-neutral unpacked extension first, integrations second.

## 19. V0.2 acceptance criteria

### AC-1 Fresh clone

On a clean checkout:

```text
npm run check
npm test
```

pass without private machine paths.

### AC-2 Existing Userscript

Given an external `.user.js`, BPW can develop it without copying its source into the BPW repository.

### AC-3 Strict-CSP target

At least one strict-CSP site passes the real Userscript development loop.

### AC-4 Target isolation

With multiple browser tabs open, BPW verification cannot silently switch to another tab.

### AC-5 Source freshness

Edit source -> reload -> evidence proves the current local source was requested.

### AC-6 Cleanup

`bpw stop` leaves the normal browser usable and disables temporary development state owned by BPW.

### AC-7 Machine-readable result

`bpw status --json` and `bpw verify --json` expose stable parseable output.

### AC-8 My Prompt regression

The My Prompt real-project case remains reproducible with explicit evidence markers.

## 20. Success metrics

V0.2 is successful when:

- a developer/AI can attach an existing Userscript with one config or one command;
- after the one-time manager setup, normal edit/reload/verify cycles require no copy/paste into Violentmonkey/Tampermonkey;
- an AI does not need to know the internal PowerShell/Node/CDP launch details;
- wrong-tab false PASS is prevented;
- source freshness is provable;
- the CLI can be used without an AI;
- future Skill/MCP integrations can be thin wrappers around the CLI.

## 21. Decisions already made for V0.2

These should not block implementation unless new evidence proves them wrong:

1. BPW is a development platform, not an autonomous AI agent.
2. CLI first; no GUI now.
3. Node remains the orchestration runtime for V0.2.
4. Windows + Chromium is the acceptance environment first.
5. Cent is the first proven browser provider, not a permanent hard dependency.
6. Violentmonkey is the first fully live-tested Userscript manager.
7. Tampermonkey remains supported by design but is not claimed PASS until live-tested.
8. Chrome Extension functionality remains adapter-based and is not implemented in V0.2 core milestones except discovery/spike work.
9. Existing mature tools are integrated rather than replaced.
10. No CSP-disabling extension or global browser-security weakening as a required workflow.

## 22. Decisions that may need owner approval later

No immediate approval is required to start M1-M4.

The following should be brought back for approval only when implementation evidence is available:

1. Whether Chrome Extension V1 should integrate WXT/Extension.js directly or remain framework-neutral first.
2. Whether to officially support normal Chrome/Edge alongside Cent in the first tagged release.
3. Whether an MCP server is worth adding after the CLI + Skill workflow is proven.
4. Whether to add a GUI after repeated real use shows CLI limitations.

## 23. Recommended immediate next step

Proceed with M1 only:

> Consolidate the current scripts behind a small `bpw` CLI without changing working Userscript semantics.

Do not add Chrome Extension implementation yet.

Acceptance for the next implementation round:

```text
bpw doctor
bpw start
bpw status
bpw reload
bpw inspect
bpw verify
bpw stop
```

must work for the bundled example, and the My Prompt regression must still pass after the refactor.
