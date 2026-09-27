# AI Browser Plugin Debug Guide

## Principle

Treat BPW as environment setup, not as the debugger.

## Default flow

1. Identify the real Userscript source and target URL.
2. Run `bpw doctor`.
3. Run:

```text
bpw start --source <real.user.js> --url <target-url>
```

4. Read the returned `cdpPort` and `agentSession`.
5. Use `agent-browser` directly with that session/CDP for the rest of the task.
6. Inspect real DOM/Console/Network only as needed for the current bug.
7. Edit the original source file, not the generated Loader.
8. Reload/verify using `agent-browser` and your own task-specific judgment.
9. Finish with `bpw stop`.

## Do not ask BPW to think

Do not add BPW commands merely to wrap existing `agent-browser` capabilities.

Examples that stay with AI + `agent-browser`:

- DOM/selectors;
- Console analysis;
- Network analysis;
- JS evaluation;
- screenshots;
- deciding what constitutes PASS for the current bug.

## Userscript rules

- Original `.user.js` is source of truth.
- Dev Loader is generated glue only.
- Keep production and dev identities separate.
- Strict-CSP execution must stay inside the Userscript-compatible sandbox/content context.
- Do not globally disable browser/site security.
- A one-time human-visible Dev Loader installation is acceptable; do not reverse-engineer unstable manager internals just to automate it.

## Human help

Ask the user only when the environment genuinely requires human action, such as CAPTCHA/Cloudflare or the first manager install when no stable public automation path exists.

## Final result

The AI decides `PASS / FAIL / BLOCKED` from real task evidence. BPW does not contain a universal verification DSL.
