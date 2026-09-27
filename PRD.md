# Browser Plugin Workbench — PRD

Status: Approved — lean reset 2026-09-27

## 1. Product

Browser Plugin Workbench (BPW) is a **small local CLI used by AI to prepare and clean up a real browser-plugin development environment**.

It is not a browser automation platform, test framework, extension framework, or AI agent.

> AI is the developer. BPW only prepares the workbench.

## 2. Target user

Primary target: one personal developer using a capable AI coding agent on Windows.

Commercial, enterprise, multi-user, cloud, marketplace, and team-management requirements are not design inputs unless a real future need appears.

## 3. Core rule

BPW owns only work that is:

- difficult for an AI to perform directly because it crosses a local environment boundary;
- mechanical/repetitive/error-prone enough to deserve deterministic code;
- necessary to safely establish or clean up the development environment.

If a capable AI can already perform a task dynamically with an existing mature tool, BPW should not wrap or reimplement it.

## 4. What BPW owns

V0.2 owns only:

1. **Userscript dev loader**
   - point at an existing external `.user.js`;
   - inherit required metadata;
   - preserve strict-CSP-compatible Userscript execution;
   - keep production and development identities separate.

2. **Local source server**
   - loopback only;
   - serve the current original source on every request;
   - expose enough identity/health data to avoid reusing or killing the wrong process.

3. **Browser/CDP bootstrap**
   - reuse `cent-cdp-browser` for the real daily Cent profile;
   - reuse `agent-browser` for CDP/tab control;
   - do not reimplement either tool.

4. **Target binding**
   - create/pin a dedicated workbench tab/session;
   - return the connection information AI needs to continue with `agent-browser` directly.

5. **Small session state + cleanup**
   - remember only what BPW needs to own/clean;
   - stop BPW-owned local services;
   - never kill unrelated browser processes.

## 5. Public CLI

V0.2 public surface is intentionally small:

```text
bpw doctor
bpw start
bpw status
bpw stop
```

Typical use:

```text
bpw start --source "D:\project\foo.user.js" --url "https://target.example/"
```

Expected result includes:

```text
READY
source: ...
devServer: http://127.0.0.1:8890
cdp: 9222
agentSession: browser-plugin-workbench
target: ...
loader: ...\WorkbenchDev.user.js
```

The AI then uses `agent-browser` directly for DOM, Console, Network, reload, click, eval, screenshot, and task-specific verification.

## 6. Explicitly not BPW features

Do **not** add the following unless a real repeated use case later proves BPW itself must own them:

- `bpw inspect`;
- `bpw console`;
- `bpw network`;
- screenshot management;
- generic verification DSL/assertion framework;
- evidence database/logging platform;
- browser automation engine;
- Userscript bundler/HMR framework;
- Chrome Extension framework;
- GUI;
- MCP server;
- daemon/database/cloud service;
- AI reasoning or automatic bug diagnosis.

## 7. Reuse policy

Use this order:

```text
existing mature tool
-> thin integration
-> small compatibility shim
-> only then new BPW implementation
```

Current preferred tools:

- browser/CDP actions: `agent-browser`;
- daily Cent/Profile/CDP startup: `cent-cdp-browser`;
- Userscript runtime: Violentmonkey first;
- modern Userscript build systems when a project already uses them: `vite-plugin-monkey` / `webpack-monkey`;
- future Chrome Extension projects: existing frameworks such as WXT / Extension.js rather than BPW-owned build tooling.

## 8. Userscript behavior

- Original external `.user.js` is the source of truth.
- BPW does not copy business source into its repository.
- Dev loader is generated and may be installed once in the Userscript manager.
- Development identity must not replace the production script.
- Loader must remove production update/download URLs.
- Strict-CSP targets must continue to work through Userscript sandbox/content-context execution, not by disabling browser/site security.
- A stopped BPW server should not create noisy errors during normal browsing; the loader should fail quietly when the local development server is intentionally unavailable.

## 9. Browser behavior

- Windows + Chromium/CDP first.
- Cent daily profile is the first proven environment, not a permanent product dependency.
- Reuse `cent-cdp-browser`; do not copy its process/profile rules into BPW.
- Create a dedicated workbench tab and pin the `agent-browser` session to it.
- Do not close/kill the user's normal browser on `bpw stop`.

## 10. Session and safety

Keep runtime state minimal and gitignored.

BPW must know which local dev-server process it owns before stopping it. A stale PID file must never be sufficient reason to kill a process.

Unknown processes, ports, browser instances, tabs, profiles, cookies, credentials, and user data remain untouched.

## 11. Skill relationship

The complete user experience is:

```text
AI
-> browser-plugin-workbench Skill
-> bpw CLI
-> cent-cdp-browser + agent-browser
-> real browser
```

The Skill contains workflow and judgment guidance. The CLI contains deterministic environment mechanics. The CLI remains independently usable without a Skill.

## 12. V0.2 done

V0.2 is complete when:

- the 4-command CLI works;
- external Userscript source works without copying;
- local server ownership is safe;
- real Cent/CDP target setup works through reused tools;
- My Prompt still runs on the strict-CSP ChatGPT path;
- AI can take over directly with `agent-browser` after `bpw start`;
- `bpw stop` removes BPW-owned local state/service without harming the normal browser.
