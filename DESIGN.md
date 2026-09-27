# Browser Plugin Workbench — V0.2 Design

Status: Approved design baseline  
Product: Browser Plugin Workbench (BPW)  
Scope: V0.2 Userscript-first CLI  

## 1. Design goal

Turn the proven V0.1 scripts into a small, stable development platform without changing the working Userscript semantics.

The public surface becomes one CLI:

```text
bpw doctor
bpw start
bpw status
bpw reload
bpw inspect
bpw console
bpw network
bpw verify
bpw stop
```

Everything else is an internal adapter or reusable upstream tool.

## 2. Hard design rule: reuse before implementation

Before adding any non-trivial capability, implementation must follow this decision order:

```text
1. Can a mature upstream tool already do it directly?
   -> integrate it.

2. Can BPW expose it with a thin adapter?
   -> write the adapter.

3. Is a small compatibility shim enough?
   -> write the smallest shim.

4. Only if the above are insufficient:
   -> implement BPW-owned logic.
```

Every meaningful new subsystem must record the reuse decision in code comments, a short design note, or the implementation report when the choice is not obvious.

### Preferred upstream ownership

| Capability | Preferred owner | BPW responsibility |
| --- | --- | --- |
| Browser/CDP interaction | `agent-browser` | session orchestration, target pinning, result normalization |
| Cent daily-profile/CDP startup | `cent-cdp-browser` | provider adapter only |
| Userscript manager/runtime | Violentmonkey / Tampermonkey | generated dev loader + lifecycle glue |
| Userscript bundling/HMR | `vite-plugin-monkey` / `webpack-monkey` when a project already uses or needs them | detect/adopt, not replace |
| Chrome Extension framework | WXT / Extension.js / Plasmo / CRXJS | future adapter, not bundler |
| Raw CDP fallback | existing CDP tooling when adequate | avoid protocol reimplementation |

Copying third-party source into BPW is not the default integration strategy. Prefer documented CLI/API/library usage, and verify license compatibility before vendoring any code.

## 3. Architecture

```text
                    +----------------------+
                    |      bpw CLI         |
                    | human + JSON output  |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    |  Session Orchestrator |
                    | lifecycle + evidence  |
                    +----+-------------+----+
                         |             |
              +----------v--+       +--v----------------+
              | Source Adapter|      | Browser Provider  |
              | Userscript V0.2|     | Cent / existing CDP|
              +------+--------+      +---------+---------+
                     |                         |
       +-------------v-------------+   +-------v---------+
       | Userscript Manager Adapter|   | agent-browser   |
       | Violentmonkey first       |   | CDP backend     |
       +-------------+-------------+   +-------+---------+
                     |                         |
                     +-------------+-----------+
                                   |
                         +---------v----------+
                         | pinned target tab   |
                         | real target website |
                         +---------+----------+
                                   |
                         +---------v----------+
                         | evidence + verify   |
                         +--------------------+
```

The CLI must not know manager-specific DOM selectors or Cent process rules directly. Those details stay behind adapters/providers.

## 4. Module boundaries

Recommended V0.2 layout:

```text
bin/
  bpw.js

src/
  cli/
    args.js
    output.js
  core/
    config.js
    session.js
    errors.js
    evidence.js
    verify.js
  adapters/
    userscript/
      metadata.js
      loader.js
      source-server.js
      manager.js
      violentmonkey.js
  browser/
    provider.js
    existing-cdp.js
    cent-cdp.js
    agent-browser.js
  commands/
    doctor.js
    start.js
    status.js
    reload.js
    inspect.js
    console.js
    network.js
    verify.js
    stop.js

tools/
  legacy/proven V0.1 helpers during migration
```

This is a target layout, not a mandate to move every file immediately. The implementation may migrate incrementally if that produces a smaller and safer diff.

## 5. Public CLI contract

### 5.1 General rules

- Human-readable output by default.
- `--json` for stable machine-readable output on all stateful commands where useful.
- Non-zero exit code on `FAIL`.
- `BLOCKED` has a distinct error code/message and a non-zero exit code unless a command is explicitly informational.
- No stack trace in normal CLI output unless `--debug` is requested.
- Commands must not silently choose a different tab/session/source after a mismatch.

### 5.2 Core result envelope

Target JSON shape:

```json
{
  "schemaVersion": 1,
  "command": "status",
  "status": "PASS",
  "sessionId": "bpw-...",
  "message": "...",
  "target": {
    "url": "https://example.com/",
    "id": "..."
  },
  "evidence": [],
  "error": null
}
```

Do not over-model V0.2. Add fields only when a command or acceptance test needs them.

## 6. Configuration design

### 6.1 Precedence

```text
CLI flags
> environment variables
> project config
> safe defaults
```

### 6.2 Machine-specific values

Machine paths such as the local `cent-cdp-browser` Skill location must not be committed in public config.

Use environment variables or a local ignored config when needed.

### 6.3 Compatibility

V0.2 may read the existing `workbench.config.json` during migration, but the new CLI contract is authoritative. Backward compatibility with internal V0.1 scripts is not a product requirement if keeping it materially complicates the CLI.

## 7. Session model

One `bpw start` creates or resumes one explicit workbench session.

Session state must record at minimum:

- schema version;
- session id;
- source path/type;
- source revision/fingerprint where practical;
- target URL and pinned target identity;
- browser provider/CDP port;
- Userscript manager/loader identity;
- owned local-server PID/port;
- timestamps;
- cleanup obligations.

Recommended path:

```text
runtime/sessions/<session-id>/state.json
```

`status` must validate live truth. A stale state file alone is never proof of a running session.

## 8. Userscript adapter design

### 8.1 Source of truth

The original external `.user.js` remains authoritative. BPW never rewrites the business source merely to support development.

### 8.2 Loader generation

The generated loader:

- inherits required metadata;
- uses an isolated development identity;
- removes update/download behavior that can overwrite the dev loader;
- adds only the minimum BPW-specific local-connect/sandbox metadata;
- fetches the current local source from the loopback source server;
- executes inside the Userscript-compatible isolated context required for strict-CSP pages.

### 8.3 Source freshness proof

Every source request must be observable by BPW.

Minimum acceptable mechanism:

- assign the current session/reload a request marker;
- source server logs a request timestamp and marker;
- `verify` can assert that a request occurred after the most recent reload/edit cycle.

Do not infer freshness only from visible DOM state.

### 8.4 Manager lifecycle

Violentmonkey is the first live-tested manager.

V0.2 may use manager UI automation if it is stable and visible, but must not make private extension-internal protocols a hard dependency when a human-visible one-time install is simpler and more durable.

Target behavior:

- detect dev loader when practical;
- enable for `start`;
- disable for `stop`;
- preserve a manual first-install fallback.

Tampermonkey support remains design-compatible but not PASS until live-tested.

## 9. Browser provider design

Browser startup is provider-based.

### 9.1 `existing-cdp`

This should be the simplest provider and should be implemented early.

Input:

- CDP port or endpoint.

Behavior:

- do not manage browser processes;
- verify CDP endpoint;
- attach `agent-browser`;
- create/pin a dedicated workbench target.

### 9.2 `cent-cdp`

Thin wrapper around the local `cent-cdp-browser` capability.

BPW must not duplicate:

- daily-profile process discovery;
- profile-lock handling;
- Cent restart safety;
- CDP port selection rules.

BPW consumes the provider result and owns the higher-level workbench session.

### 9.3 Future providers

Chrome/Edge should normally reuse a generic Chromium/existing-CDP provider before adding browser-specific process managers.

## 10. Browser-control backend

Use `agent-browser` as the primary V0.2 control backend where it already provides the required operation.

BPW wraps, normalizes, and constrains it rather than reproducing it.

Required backend capabilities:

- connect to CDP;
- create/list/select tabs;
- pin the workbench target;
- get URL/title;
- snapshot DOM;
- evaluate harmless JS/predicates;
- read Console;
- read Network when available;
- screenshots when requested.

If one required feature is missing, first evaluate another existing backend/tool before adding raw CDP code.

## 11. Target isolation

Target isolation is a correctness boundary.

Rules:

1. `start` creates or explicitly selects a dedicated target.
2. The target identity is persisted.
3. Every target-sensitive command verifies the identity before acting.
4. If the target disappears, return `BLOCKED`/`FAIL`; never silently use another tab.
5. A matching hostname alone is insufficient when multiple tabs share the same hostname.

## 12. Evidence design

Evidence is operational data, not a verbose permanent trace of everything the user does.

Recommended artifacts:

```text
runtime/sessions/<id>/
  state.json
  source-requests.jsonl
  console.jsonl
  network.jsonl        # optional/backend-dependent
  verify.json
  screenshots/         # on demand
```

Rules:

- runtime remains gitignored;
- redact/omit sensitive form values and credentials by default;
- evidence should be bounded in size;
- `verify.json` records the checks used for the final status.

## 13. Verification engine

Do not create a general testing framework.

V0.2 only needs composable checks required by browser-plugin debugging:

- target identity matches;
- source request freshness;
- selector existence/count;
- text presence;
- JS predicate;
- Console error filter;
- optional Network failure filter.

Example configuration or CLI flags may describe checks, but the initial implementation should stay small.

## 14. Error model

Use stable symbolic codes for AI consumption.

Examples:

```text
BPW_CONFIG_INVALID
BPW_SOURCE_NOT_FOUND
BPW_PORT_IN_USE
BPW_CDP_UNAVAILABLE
BPW_TARGET_MISSING
BPW_TARGET_MISMATCH
BPW_LOADER_NOT_INSTALLED
BPW_SOURCE_NOT_REFRESHED
BPW_VERIFY_FAILED
BPW_USER_ACTION_REQUIRED
```

Do not expose upstream raw errors as the only machine-readable contract. Preserve them as debug details when useful.

## 15. Process ownership and cleanup

BPW may stop only processes it owns or a provider explicitly owns under its own contract.

`bpw stop` must:

1. disable BPW development state where supported;
2. stop the BPW-owned local source server;
3. close or release BPW-owned automation session state;
4. leave the user's normal browser usable;
5. never kill unrelated browser processes just to make cleanup look complete.

If cleanup cannot be proven safe, report the remaining item rather than force it.

## 16. Migration from V0.1

The current scripts are working evidence and should be mined, not discarded.

Reuse candidates:

- `generate-userscript-loader.js` -> Userscript metadata/loader module;
- `dev-server.js` -> source-server module;
- `dev-server-control.js` -> lifecycle ideas, subject to validation;
- `start-browser.ps1` -> provider behavior contract, not necessarily permanent implementation;
- `verify-browser.ps1` -> target/CDP acceptance logic;
- `selftest.js` / `smoke-test.js` -> regression baseline.

Do not rewrite working behavior merely to satisfy the target folder structure.

## 17. Testing strategy

Three levels only:

### L1 — Pure/static

- metadata parsing/transformation;
- config precedence;
- session serialization;
- verify predicates;
- JSON result shape.

### L2 — Local integration

- source server lifecycle;
- loader generation;
- request freshness evidence;
- CLI command composition with mocked/fakeable external adapters where appropriate.

### L3 — Real-machine acceptance

- real Cent daily profile;
- real CDP attach;
- real Violentmonkey;
- real target site;
- real external Userscript such as My Prompt;
- target isolation with multiple tabs.

L3 is required before declaring V0.2 complete.

## 18. Security/privacy boundaries

- loopback-only local services by default;
- no automatic Cloudflare/CAPTCHA bypass;
- no credential dumping;
- no broad browser-profile export/copy;
- no disabling target-site/browser security as a normal development requirement;
- no remote exposure of CDP by default;
- target-scoped AI operations wherever backend permits.

## 19. Deferred design decisions

These are intentionally not solved in V0.2:

- GUI framework;
- MCP protocol/server;
- cloud/remote browser mode;
- extension-store publishing;
- full Chrome Extension implementation;
- generalized test runner;
- multi-user/team server architecture.

## 20. Design acceptance

This design is considered implemented only when the public CLI hides the V0.1 implementation details and the real My Prompt regression still demonstrates the same or better behavior.

Architecture elegance alone is not acceptance.

