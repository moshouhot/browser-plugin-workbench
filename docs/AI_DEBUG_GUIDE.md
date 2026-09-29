# AI Browser Plugin Debug Guide

## Principle

Treat BPW as environment setup, not as the debugger.

## Default flow

1. Identify the real Userscript source and target URL.
2. Run `bpw doctor`.
3. Create a temporary request JSON:

```text
{
  "source": "C:\\path\\to\\real.user.js",
  "url": "https://target.example/",
  "manager": "violentmonkey"
}
```

Use `"manager": "tampermonkey"` for Tampermonkey. Then run:

```text
bpw start --request <request.json>
```

The direct `--source/--url` form remains fine for a human terminal, but request JSON is preferred for policy-controlled agents.

4. Read the returned `targetCdpUrl`, `cdpPort`, and `agentSession`.
5. Use `agent-browser` directly with that session/CDP for the rest of the task.
6. Inspect real DOM/Console/Network only as needed for the current bug.
7. Edit the original source file, not the generated Loader.
8. Reload/verify using `agent-browser` and your own task-specific judgment.
9. If verification passes, run `bpw finish` to promote the current source into the selected Userscript manager and clean the dev lifecycle.
10. If you want to abandon the change or only restore the pre-debug manager state, run `bpw stop` instead.

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
- Supported Violentmonkey/Tampermonkey flows automatically manage the Dev Loader lifecycle. Use `--manual-loader` only as an explicit compatibility mode.
- Violentmonkey uses its background API; Tampermonkey uses its internal Fast API. Do not fall back to manager dashboard UI automation.

## Human help

Ask the user only when the environment genuinely requires human action, such as CAPTCHA/Cloudflare or the first manager install when no stable public automation path exists.

## Final result

The AI decides `PASS / FAIL / BLOCKED` from real task evidence. BPW does not contain a universal verification DSL.
