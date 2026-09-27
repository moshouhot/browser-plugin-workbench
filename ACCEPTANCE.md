# Browser Plugin Workbench — V0.2 Acceptance

Status: Approved acceptance contract  
Result vocabulary: `PASS / FAIL / BLOCKED`  

## 1. Acceptance philosophy

V0.2 is accepted by observable behavior, not by architecture claims.

The implementer must provide command output, generated evidence, test results, or real-browser observations sufficient for an independent reviewer to reproduce the conclusion.

No gate may be marked PASS solely because code exists.

## 2. Gate G0 — Scope and reuse discipline

### G0.1 No scope expansion

PASS when V0.2 does not introduce, as required architecture:

- GUI;
- MCP server;
- cloud backend;
- Chrome Extension implementation beyond an isolated discovery/spike;
- custom browser automation engine;
- custom bundler/HMR framework.

### G0.2 Reuse-first evidence

For each substantial new subsystem, the implementation report identifies whether an existing mature project already owns the capability.

FAIL examples:

- raw CDP client implemented even though `agent-browser` already exposes the required operation;
- custom Userscript bundler added without a demonstrated gap;
- Cent process/profile logic copied into BPW instead of using the provider.

### G0.3 Third-party licensing

If third-party source is copied/vendored, license compatibility and attribution are documented.

PASS is automatic if no third-party source is vendored and upstream tools are used through normal dependency/CLI/API integration.

## 3. Gate G1 — Repository and fresh-clone baseline

From a clean checkout:

```text
npm run check
npm test
```

must PASS.

Also verify:

- runtime/session artifacts are ignored;
- no developer-machine absolute path is required in committed config;
- `git diff --check` is clean before final delivery;
- public README instructions match the implemented CLI.

Evidence:

- command logs;
- final commit SHA;
- `git status --short` clean.

## 4. Gate G2 — CLI contract

The following commands must exist:

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

### G2.1 Help and errors

- `bpw --help` succeeds;
- unknown command exits non-zero;
- missing required source/URL/config returns a concise stable error;
- normal failures do not dump an unhandled stack trace unless debug mode is requested.

### G2.2 JSON

At minimum:

```text
bpw doctor --json
bpw status --json
bpw verify --json
```

return parseable JSON with:

- schema version;
- command;
- status;
- message;
- session id when applicable;
- error object/code when applicable.

### G2.3 Exit codes

- PASS -> zero;
- FAIL -> non-zero;
- BLOCKED -> non-zero for state-changing/verification commands.

## 5. Gate G3 — Existing project / Userscript adapter

### G3.1 External source of truth

Use an external `.user.js` outside the BPW repository.

PASS when:

- BPW reads/serves the external file directly;
- no business-source copy is created inside BPW as the development source;
- editing the original file changes the served source on the next development cycle.

### G3.2 Metadata preservation

Test a source containing representative metadata:

- `@match`;
- `@grant`;
- `@require`;
- `@resource`;
- `@connect`;
- `@run-at` where applicable.

PASS when required behavior survives in the dev loader.

### G3.3 Development isolation

The dev loader must not overwrite the normal production-installed Userscript identity/update flow.

### G3.4 Strict-CSP compatibility

At least one strict-CSP target must execute the development Userscript without the prior CSP `EvalError` regression.

Disabling site/browser CSP globally is a FAIL.

## 6. Gate G4 — Browser provider and target isolation

### G4.1 Existing CDP

Given a valid existing CDP endpoint:

- BPW attaches without managing/killing browser processes;
- creates/selects a dedicated target;
- stores target identity.

### G4.2 Cent provider

For the Cent acceptance environment:

- reuse the existing daily profile through the provider;
- loopback CDP only;
- no duplicate browser/profile implementation inside BPW;
- no unknown-process termination.

### G4.3 Multi-tab isolation

Open multiple plausible tabs, including at least two on the same or similar target site when practical.

PASS when:

- `reload/inspect/console/verify` remain on the pinned target;
- closing the pinned target causes explicit failure;
- BPW never silently chooses another tab.

## 7. Gate G5 — Source freshness and evidence

### G5.1 Request evidence

After `bpw reload`, evidence must prove that the local source server received a request for the current session/reload.

PASS requires a timestamp/marker newer than the relevant reload boundary.

Visible DOM alone is insufficient.

### G5.2 Runtime evidence

At minimum, the active session exposes:

```text
state.json
source request evidence
verify.json
```

Console/network evidence may be files or normalized command output, but must be available for final verification when relevant.

### G5.3 Privacy

Evidence must not intentionally record credentials, cookies, authorization headers, or full sensitive form values by default.

## 8. Gate G6 — Debugging commands

### G6.1 Inspect

`bpw inspect` returns at least:

- pinned URL;
- title;
- useful DOM/snapshot output.

### G6.2 Console

`bpw console` can surface recent target errors without attaching to another tab.

### G6.3 Network

If the selected backend supports reliable Network inspection, `bpw network` returns recent requests/failures.

If the backend genuinely cannot provide this reliably, V0.2 may mark this one capability `BLOCKED` only if:

- the limitation is documented;
- no mature already-compatible backend solves it cheaply;
- core Userscript start/reload/verify flow remains PASS.

### G6.4 Reload

Reload affects only the pinned target and preserves session identity.

## 9. Gate G7 — Verification behavior

The verifier must demonstrate:

1. target identity check;
2. source freshness check;
3. selector existence/count check;
4. JS predicate check;
5. Console blocking-error check.

Tests must include at least one intentional failure for each major predicate family to prove false conditions do not PASS.

`verify.json` records:

- checks run;
- pass/fail result per check;
- final status;
- evidence references.

## 10. Gate G8 — Lifecycle and cleanup

### G8.1 Start

`bpw start` reaches READY only after:

- source valid;
- local source server ready;
- browser/CDP ready;
- target pinned;
- loader state known.

### G8.2 Status truth

Kill/close one owned component unexpectedly, then run `bpw status`.

PASS when stale files/PIDs do not produce a false READY/PASS.

### G8.3 Stop

`bpw stop`:

- disables BPW dev loader when supported;
- stops BPW-owned local service;
- releases BPW session state;
- leaves the normal browser/profile usable;
- does not kill unrelated browser processes.

## 11. Gate G9 — Real My Prompt regression

This is mandatory before final V0.2 PASS.

Use the real external My Prompt project in the local acceptance environment; do not copy its source into BPW.

Environment currently proven by V0.1:

- Windows;
- Cent Browser daily profile;
- Violentmonkey;
- ChatGPT target;
- CDP + `agent-browser`.

Required evidence:

### G9.1 Baseline

Dedicated target established and identifiable.

### G9.2 Loader/source

- BPW dev loader enabled for the test;
- local source request observed after reload;
- source path is the external My Prompt file.

### G9.3 Runtime effect

At least the established My Prompt feature markers are observed again, such as:

- prompt button marker;
- `.mp-prompt-wrapper`;
- theme/modal markers or equivalent current known markers.

If the upstream site changes, equivalent feature-specific markers may replace these with documented evidence.

### G9.4 CSP regression

No previous development-loader CSP `EvalError` remains.

### G9.5 Cleanup

- dev loader disabled after test;
- BPW-owned source server stopped;
- normal Cent profile remains usable.

## 12. Gate G10 — Regression and compatibility

### G10.1 Bundled example

Bundled example passes end-to-end through the new CLI.

### G10.2 V0.1 proven semantics

The refactor must preserve:

- external source support;
- inherited metadata;
- strict-CSP loader behavior;
- real daily-profile browser flow;
- target pinning;
- AI attach verification.

Implementation details may change.

### G10.3 Tampermonkey wording

Do not claim Tampermonkey live PASS unless a real Tampermonkey test was executed and evidence is included.

## 13. Gate G11 — Documentation and public repository

PASS when:

- README describes the CLI rather than internal helper scripts as the primary workflow;
- `PRD.md`, `DESIGN.md`, `IMPLEMENTATION_PLAN.md`, `ACCEPTANCE.md` agree on scope;
- supported vs planned environments are clearly distinguished;
- reusable My Prompt lessons remain documented without publishing local secrets/paths;
- final branch is pushed to the public repository.

## 14. Final report format

The implementing AI must end with a concise evidence report:

```text
FINAL: PASS | FAIL | BLOCKED

HEAD: <sha>
Branch: <branch>
Worktree: clean/dirty

Automated:
- npm run check: PASS/FAIL
- npm test: PASS/FAIL
- <new CLI tests>: PASS/FAIL

Live:
- bundled example: PASS/FAIL/BLOCKED
- My Prompt: PASS/FAIL/BLOCKED
- multi-tab isolation: PASS/FAIL/BLOCKED
- cleanup: PASS/FAIL/BLOCKED

Reuse audit:
- upstream tools reused: ...
- substantial BPW-owned replacements of existing capability: none / justified list

Open findings:
- ...
```

Do not report FINAL PASS if any mandatory gate is FAIL or BLOCKED.

## 15. Approval rule

Minor implementation defects may be repaired autonomously.

Return to the owner only for a major product/scope decision listed in `IMPLEMENTATION_PLAN.md`, or when a mandatory acceptance gate cannot be satisfied without such a decision.
