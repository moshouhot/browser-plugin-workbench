# Browser Plugin Workbench — V0.2 Implementation Plan

Status: Approved implementation baseline  
Strategy: incremental migration, reuse-first, evidence-driven  

## 1. Implementation rule

Do not start by rewriting the repository.

The first objective is to place a stable `bpw` CLI in front of behavior that already works, then migrate internals only when tests/evidence justify it.

For every new subsystem, check mature upstream options first. The implementation report must explicitly call out any substantial BPW-owned capability that could plausibly have been delegated to an existing project and explain why it was not.

## 2. Scope freeze for the first implementation round

Implement V0.2 Userscript CLI only.

In scope:

- unified CLI;
- config/session/result contracts;
- existing-CDP and Cent-CDP provider boundary;
- Userscript source/loader/server lifecycle;
- pinned-target operations;
- evidence and verification;
- My Prompt regression.

Out of scope:

- GUI;
- MCP;
- Chrome Extension implementation;
- new bundler/HMR framework;
- new browser automation engine;
- cloud mode;
- automatic security-challenge bypass.

## 3. Phase 0 — Baseline freeze

Goal: prove the starting point before structural changes.

Tasks:

1. Run and record current `npm run check` and `npm test`.
2. Record the current V0.1 My Prompt live-test procedure and expected markers.
3. Confirm runtime artifacts remain gitignored.
4. Confirm public config contains no private machine path.
5. Create a baseline Git commit if the documentation freeze is not already committed.

Exit criteria:

- clean Git worktree;
- baseline commit SHA recorded;
- existing automated tests PASS;
- real regression procedure is reproducible or explicitly BLOCKED for an environmental reason.

## 4. Phase 1 — Introduce the `bpw` shell

Goal: create the public CLI without moving working internals unnecessarily.

Deliver:

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

Tasks:

1. Add `bin/bpw.js` or equivalent executable entry.
2. Add minimal argument parsing. Prefer Node built-ins or an already-present lightweight dependency; do not add a CLI framework unless it materially reduces complexity.
3. Add standard human output and `--json` result envelope.
4. Initially call/adapt proven V0.1 helpers where possible.
5. Add command-level exit-code tests.

Exit criteria:

- commands exist and have help output;
- `doctor/status --json` return parseable stable JSON;
- no business behavior regression;
- no GUI/MCP/extension scope added.

Recommended commit boundary:

```text
feat: add unified bpw cli shell
```

## 5. Phase 2 — Config and session contracts

Goal: stop passing implicit state between scripts.

Tasks:

1. Implement config precedence: CLI > env > config > defaults.
2. Define schema version 1 for session/result JSON.
3. Create runtime session directory/state.
4. Make `status` validate live state, not just files/PIDs.
5. Introduce stable error codes.
6. Keep old config readable only where doing so is cheap.

Exit criteria:

- external Userscript path works;
- public config has no machine-specific tool path requirement;
- stale state is detected;
- tests cover precedence and serialization.

Recommended commit boundary:

```text
feat: add config and session contracts
```

## 6. Phase 3 — Browser provider boundary

Goal: remove browser-specific knowledge from CLI commands.

Implement in this order:

### 3A. `existing-cdp`

Prefer the simplest reusable path first.

Tasks:

- accept an existing CDP port/endpoint;
- verify endpoint;
- attach `agent-browser`;
- create/pin target;
- persist target identity.

### 3B. `cent-cdp`

Tasks:

- wrap the existing `cent-cdp-browser` capability;
- consume its structured output;
- do not copy its process/profile implementation into BPW;
- expose provider status/errors through BPW error codes.

Exit criteria:

- CLI code has no direct Cent process-kill/profile-lock implementation;
- existing-CDP path can be tested independently;
- Cent path still passes daily-profile regression.

Recommended commit boundary:

```text
feat: add browser provider adapters
```

## 7. Phase 4 — Userscript adapter migration

Goal: convert proven V0.1 loader/server behavior into reusable modules.

Tasks:

1. Extract metadata parsing/transformation from `generate-userscript-loader.js`.
2. Preserve strict-CSP behavior already proven with My Prompt.
3. Keep external source as source of truth.
4. Keep development identity isolated.
5. Start/reuse local loopback source server through a clear ownership contract.
6. Add source-request evidence with session/reload marker.
7. Keep manager-specific lifecycle behind an adapter.

Reuse checkpoint:

- review `vite-plugin-monkey` and `webpack-monkey` for any metadata/HMR behavior that should be integrated rather than recreated;
- do not migrate an existing plain Userscript project to either framework merely to satisfy BPW.

Exit criteria:

- bundled example works;
- external source works;
- source freshness is provable;
- strict-CSP development path remains functional.

Recommended commit boundary:

```text
refactor: move userscript flow behind adapter
```

## 8. Phase 5 — Target-scoped debugging commands

Goal: expose the useful `agent-browser` capabilities through the BPW session.

Tasks:

- `reload` pinned target;
- `inspect` snapshot/URL/title;
- `console` recent/error-only output;
- `network` when backend capability is reliable;
- screenshots only when explicitly requested or required by a verifier.

Reuse checkpoint:

Do not parse or reinvent the accessibility snapshot if `agent-browser` output is adequate. Normalize only enough for stable BPW output.

Exit criteria:

- every command confirms target identity;
- closing pinned target produces explicit failure;
- commands never silently fall back to another tab.

Recommended commit boundary:

```text
feat: add target-scoped debugging commands
```

## 9. Phase 6 — Verification and evidence

Goal: make PASS evidence-based.

Tasks:

1. Implement small verification primitives:
   - target identity;
   - source freshness;
   - selector/count;
   - text;
   - JS predicate;
   - Console blocking-error filter;
   - optional Network failure filter.
2. Write `verify.json`.
3. Return `PASS / FAIL / BLOCKED` consistently.
4. Make `bpw verify --json` suitable for AI consumption.

Exit criteria:

- a stale source request cannot PASS freshness;
- wrong target cannot PASS;
- a failing predicate exits non-zero;
- evidence paths are returned in JSON.

Recommended commit boundary:

```text
feat: add evidence-based verification
```

## 10. Phase 7 — Userscript manager lifecycle

Goal: reduce the only remaining awkward manual step without coupling BPW to fragile private internals.

Violentmonkey first.

Tasks:

1. Detect whether the BPW development loader is installed when feasible.
2. Enable on `start` and disable on `stop` through the most stable visible/documented path available.
3. Preserve one-time manual installation fallback.
4. Ensure normal installed production script is not overwritten.
5. Keep Tampermonkey behavior compatible but do not claim live PASS until tested.

Stop condition:

If reliable automation requires reverse-engineering unstable private extension storage/protocols, keep the manual one-time install and document the tradeoff rather than over-engineer V0.2.

Exit criteria:

- normal edit/reload cycles do not require copy/paste;
- cleanup disables BPW development state;
- production Userscript remains intact.

Recommended commit boundary:

```text
feat: manage userscript development loader lifecycle
```

## 11. Phase 8 — Real regression and closeout

Goal: prove the refactor did not merely pass synthetic tests.

Required real-machine regression:

### R1 — Bundled example

- fresh CLI start;
- source request proven;
- target pinned;
- verify passes;
- stop cleans up.

### R2 — My Prompt

Use the real external My Prompt project without copying it into BPW.

Required evidence:

- Cent daily profile reused;
- Violentmonkey dev loader active only for the test;
- ChatGPT target pinned;
- local source request observed;
- known My Prompt DOM markers appear;
- no prior CSP `EvalError` regression;
- stop disables dev loader / ends BPW-owned local service;
- normal browser remains usable.

### R3 — Multi-tab isolation

Open at least two plausible target tabs and prove BPW commands remain pinned to the intended target.

Exit criteria:

All acceptance gates in `ACCEPTANCE.md` PASS or any remaining item is reported as a real, narrowly-scoped BLOCKED item.

Recommended commit boundary:

```text
test: close v0.2 real-browser acceptance
```

## 12. Phase 9 — Documentation and release readiness

Only after implementation acceptance:

- update README to use `bpw` commands as primary path;
- keep internal helper docs secondary;
- document prerequisites and one-time Userscript manager setup;
- document `existing-cdp` portability path;
- record supported vs merely designed/tested environments accurately;
- add release notes/changelog if a V0.2 tag is created.

## 13. What the implementing AI may decide autonomously

Without owner approval, the implementer may:

- choose small internal file/module boundaries;
- choose Node built-ins vs a lightweight dependency when justified;
- refactor proven helpers incrementally;
- add tests and fixtures;
- repair discovered implementation defects;
- adjust command internals while preserving public contracts;
- choose a better upstream integration after verifying it fits the PRD.

## 14. What requires owner approval

Stop and ask before:

- changing the product from CLI-first to GUI/MCP-first;
- implementing Chrome Extension as a major new V0.2 scope;
- replacing Node with another primary runtime;
- requiring migration of existing Userscripts to Vite/Webpack;
- abandoning real daily-profile debugging as the primary local mode;
- weakening browser/site security as a normal requirement;
- vendoring a substantial third-party codebase instead of integrating it;
- destructive changes outside the BPW repository or its explicitly owned runtime artifacts.

## 15. Completion rule

Do not announce V0.2 complete because all source files were written.

Completion requires `ACCEPTANCE.md` evidence, including the real My Prompt regression.

