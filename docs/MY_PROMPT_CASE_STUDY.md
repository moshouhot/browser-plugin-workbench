# My Prompt real-world validation

Browser Plugin Workbench V0.1 was validated against a real, large Userscript rather than only the bundled example.

## Target

- Userscript: My Prompt
- Browser: Cent Browser
- Userscript manager: Violentmonkey 2.41.0
- Target site: ChatGPT
- Browser control: CDP + agent-browser

## What this exposed

The real script depends on multiple `GM_*` APIs, `@require`, `@resource`, `@connect`, and many site match rules. This showed that a development loader cannot treat a Userscript as ordinary page JavaScript.

The workbench was therefore changed to:

- serve the original external `.user.js` directly rather than copy it;
- inherit the source metadata;
- remove update/download URLs from the development loader;
- use an isolated development name and namespace;
- force Violentmonkey `@inject-into content` and Tampermonkey `@sandbox DOM` for strict-CSP sites;
- keep the local source server on loopback only;
- verify the actual target tab through CDP instead of accepting any open browser tab.

## Live evidence

Before the development loader was active, the dedicated ChatGPT test tab contained no My Prompt feature nodes.

After enabling the loader and refreshing with the local source server active, CDP observed the expected My Prompt DOM markers, including the prompt button wrapper and theme/modal nodes, with the earlier CSP execution error gone.

The development loader was disabled again after the test so it would not interfere with normal browsing.
