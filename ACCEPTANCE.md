# Browser Plugin Workbench — Lean V0.2 Acceptance

Status: Approved

Final result: `PASS / FAIL / BLOCKED`.

## G1 — Scope stays small

PASS only if public CLI contains exactly the intended core workflow:

```text
doctor
start
status
stop
```

No public BPW wrappers for DOM, Console, Network, screenshots, reload, generic verification, or AI diagnosis.

No GUI, MCP server, daemon, database, cloud backend, custom browser automation engine, Userscript bundler, or Chrome Extension framework.

## G2 — Reuse

PASS when:

- Cent/Profile/CDP startup reuses `cent-cdp-browser`;
- browser/tab operations reuse `agent-browser`;
- BPW does not reproduce those systems internally.

## G3 — Userscript source

Given an external `.user.js`:

- original file remains the source of truth;
- BPW serves it directly;
- no business-source copy becomes authoritative;
- dev loader keeps required metadata and isolated dev identity;
- production update/download metadata is removed;
- strict-CSP execution behavior remains intact.

## G4 — Source server safety

- binds loopback only;
- health identifies BPW/app PID/source;
- wrong/mismatched server on the desired port is not silently reused;
- stale/mismatched PID is never blindly killed;
- `stop` only stops a proven BPW-owned server.

An intentional stopped-server state should not spam page Console through the installed loader.

## G5 — CLI mechanics

`bpw doctor` is read-only.

`bpw start --source <file> --url <url>`:

- generates loader;
- starts/reuses correct local server;
- invokes existing browser bootstrap;
- establishes a dedicated pinned `agent-browser` session/tab;
- returns source/server/CDP/session/target information.

`bpw status` reports BPW-owned state without pretending to analyze the webpage.

`bpw stop` cleans BPW-owned local service/state and leaves the normal browser alive.

## G6 — Automated regression

Required:

```text
npm run check
npm test
```

plus new minimal CLI/lifecycle tests.

Tests must include an ownership-mismatch case proving an unrelated process is not killed.

## G7 — Real My Prompt regression

Mandatory before final V0.2 PASS:

- external My Prompt source is used directly;
- real Cent daily profile + Violentmonkey + ChatGPT path is exercised;
- strict-CSP loader path still works;
- established My Prompt feature markers are visible or equivalent current markers are documented;
- old CSP `EvalError` does not return;
- after `bpw start`, AI can continue with `agent-browser` directly;
- after `bpw stop`, Cent remains usable and BPW local server is stopped.

The AI may choose the appropriate DOM/Console/Network/screenshot checks for this regression. Those checks are not BPW product features.

## G8 — Repository hygiene

- public config contains no private machine-specific path;
- runtime remains ignored;
- README describes the 4-command workflow and Skill + CLI relationship;
- docs do not claim untested manager/browser support as PASS;
- `git diff --check` passes;
- final worktree is clean.

## Final report

Report:

```text
FINAL: PASS | FAIL | BLOCKED
HEAD: <sha>
Automated: ...
Live My Prompt: ...
Server ownership safety: ...
Cent still running after stop: ...
Scope audit: no unnecessary BPW wrappers / list exceptions
Open findings: ...
```

Do not report FINAL PASS while any mandatory gate is FAIL or BLOCKED.
