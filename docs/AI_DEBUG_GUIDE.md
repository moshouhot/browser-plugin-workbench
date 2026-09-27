# AI Browser Plugin Debug Guide

## 目标

让 AI 在真实 Windows + 日常 Cent Profile 上形成闭环：

```text
修改脚本
-> 本地 dev server
-> Userscript dev loader
-> 真实目标网页
-> CDP attach
-> DOM / Console / Network / 点击验证
-> 最小修复
-> 再验证
```

## AI 默认流程

1. 读取 `workbench.config.json`。
2. 运行 `npm run check`。
3. 运行 `npm run prepare:userscript`。
4. AI/自动化优先运行 `npm run dev:start`，让 dev server 脱离短生命周期工具 session；人工终端开发仍可用前台 `npm run dev`。确认 `/healthz` 与 `/userscript` 返回正常。
5. 运行 `npm run browser`。浏览器启动/Profile/CDP 规则以本机 `cent-cdp-browser` Skill 为准；工作台随后新建一个专属 target 标签并用 `--pin-tab` 锁定。
6. 运行 `npm run browser:verify`，必须证明：
   - `/json/version` 可达；
   - `agent-browser --cdp --pin-tab` 读取到的 URL 属于 `targetUrl`，不能误验其他已有标签；
   - 能执行无害 JS。
7. 在真实目标页复现问题。
8. 优先读真实 DOM、computed style、Console、Network，再决定是否改代码。
9. 修改后刷新目标页重新验证。
10. 最终只报告 `PASS / FAIL / BLOCKED`。

## 用户辅助边界

AI 能自动完成的不要推给用户。只在下面情况要求最少人工操作：

- 第一次需要安装 `runtime/WorkbenchDev.user.js` 到 Userscript 管理器；
- Cloudflare/CAPTCHA 等真人挑战超出本地 `cent-cdp-browser` Skill 可自动处理范围；
- 必须由用户制造某种真实 UI 状态，而当前页面自然不会出现；
- 关闭日常 Cent 前存在明显未保存的重要网页内容。

## Userscript 调试原则

- `userscript.sourcePath` 可以直接指向其他项目里的真实 `.user.js`，无需复制源码。
- 开发 Loader 会继承原脚本的 Userscript 元数据，并使用独立名称/namespace，避免覆盖正式脚本。
- 对严格 CSP 页面，开发 Loader 使用 Violentmonkey `@inject-into content` / Tampermonkey `@sandbox DOM` 的隔离执行模式。
- Loader 只是开发入口，不把业务逻辑写进 Loader。
- 修改真实脚本后无需重新安装 Loader，刷新网页即可拉取最新版。
- 默认不要用 `@match *://*/*`。开发 Loader 的权限范围应与目标站点一致或更窄。
- 不因为看到旧 selector 就重构。先用当前真实 DOM 证明失效。

## Chrome Extension 预留规则

当前只预留 `targets/chrome-extension` 和 `chromeExtension` 配置。

后续实现时必须复用：

- 同一个 Cent/CDP 基础设施；
- 同一套 `PASS / FAIL / BLOCKED` 验收思想；
- 真机页面证据优先。

不要再造第二套浏览器 Profile/CDP 管理器。

## 验收底线

Userscript 工作台 V0.1 至少满足：

```text
npm run check                PASS
npm run prepare:userscript   PASS
npm test                     PASS
tools/start-browser.ps1 -DryRun PASS
```

涉及真实浏览器时还必须满足：

```text
CDP /json/version   PASS
AI attach           PASS
真实目标页验证      PASS 或明确 BLOCKED
```
