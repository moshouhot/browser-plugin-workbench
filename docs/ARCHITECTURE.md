# Architecture

BPW V0.2 deliberately keeps the architecture small:

```text
AI / browser-plugin-workbench Skill
                |
                v
              bpw CLI
                |
     +----------+----------+
     |                     |
Userscript loader      local source server
                           |
     +---------------------+
     |
     +--> cent-cdp-browser --> Cent/Profile/CDP
     |
     +--> agent-browser --> pinned workbench tab
```

After `bpw start`, browser debugging goes directly through `agent-browser`.

BPW intentionally does not provide its own DOM, Console, Network, screenshot, assertion, or AI reasoning layer.

## Why this shape

- AI already handles contextual diagnosis and verification well.
- `agent-browser` already exposes browser operations.
- `cent-cdp-browser` already owns Cent/Profile/CDP mechanics.
- BPW adds value only where local Userscript/environment glue would otherwise be repeated and error-prone.

Add another architectural layer only after a real repeated problem proves it is needed.
