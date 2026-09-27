# Browser Plugin Workbench — Lean V0.2 Implementation Plan

Status: Approved

## Phase 0 — Freeze new direction

- Replace the earlier platform-style PRD/design/acceptance with the lean contract.
- Run existing `npm run check` and `npm test`.
- Commit this documentation reset separately.

## Phase 1 — Minimal CLI

Add a single small CLI entrypoint with:

```text
bpw doctor
bpw start
bpw status
bpw stop
```

Prefer Node built-ins and existing scripts.

Add npm `bin` metadata so local `npm link` can expose `bpw`, but do not require publishing to npm.

Do not implement inspect/console/network/reload/verify commands.

## Phase 2 — Make existing helpers CLI-friendly

Add only the overrides needed for `bpw start --source ... --url ...` without editing committed config:

- source;
- target URL;
- dev-server port if needed;
- CDP port/session if needed.

Keep the original config as fallback.

## Phase 3 — Fix source-server ownership safety

Harden the known V0.1 lifecycle weakness:

- health endpoint identifies BPW, PID, and source;
- do not reuse an arbitrary server responding on the port;
- PID state contains enough identity to validate ownership;
- `stop` never blindly kills a stale reused PID.

This is required because it is mechanical safety code AI should not improvise every run.

## Phase 4 — Quiet idle loader

Keep strict-CSP behavior, but make the one-time-installed loader quietly no-op when BPW is intentionally stopped.

Do not build automatic Violentmonkey private-storage management in V0.2.

## Phase 5 — Tests

Extend tests only around BPW-owned mechanics:

- CLI parsing/help;
- doctor on bundled example;
- source override;
- server identity and safe reuse;
- stale/mismatched PID does not kill an unrelated process;
- start/status/stop local lifecycle without real browser where practical;
- existing loader metadata regression.

Do not build a generic test framework.

## Phase 6 — Real browser acceptance

Use the existing local `cent-cdp-browser` capability and real My Prompt regression.

The AI performs browser observation/verification with `agent-browser`; BPW itself does not gain those commands.

Required live result:

- real external My Prompt source;
- source server active;
- Cent daily profile/CDP available;
- dedicated target session/tab created;
- My Prompt still executes on ChatGPT without the old CSP `EvalError`;
- AI can directly use `agent-browser` after `bpw start`;
- `bpw stop` stops BPW server without killing Cent.

## Phase 7 — Thin Skill

Only after CLI behavior is stable, add/package a minimal `browser-plugin-workbench` Skill that teaches AI how to use `bpw` + `agent-browser`.

The Skill is instructions, not another implementation.

## Git discipline

Use small logical commits, for example:

```text
docs: simplify v0.2 around ai-first workflow
feat: add minimal bpw cli
fix: make dev server ownership safe
test: cover minimal bpw lifecycle
docs: add browser plugin workbench skill workflow
```

## Stop/approval conditions

Return to the owner only if implementation evidence suggests we must:

- add a major new subsystem;
- depend on private/brittle browser-extension internals;
- replace Node as the runtime;
- build a feature already provided well by `agent-browser`, `cent-cdp-browser`, or a mature framework;
- perform destructive/global machine changes.

Ordinary implementation details and bug fixes are autonomous.

