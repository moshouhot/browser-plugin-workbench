# Architecture

BPW V0.2.1 deliberately keeps the architecture small:

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

`bpw finish` promotes the verified real source and closes the development lifecycle. `bpw stop` restores the pre-debug Userscript state without promotion. Neither path uses Userscript-manager management-page UI automation.

## Why this shape

- AI already handles contextual diagnosis and verification well.
- `agent-browser` already exposes browser operations.
- `cent-cdp-browser` already owns Cent/Profile/CDP mechanics.
- BPW adds value only where local Userscript/environment glue would otherwise be repeated and error-prone.

Add another architectural layer only after a real repeated problem proves it is needed.
