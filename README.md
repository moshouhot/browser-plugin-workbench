# Browser Plugin Workbench

一个面向 AI + 真机浏览器的本地调试工作台。

第一版重点支持 **Userscript / 油猴脚本**：

- 本地源码开发；
- 自动生成 Violentmonkey/Tampermonkey 开发 Loader；
- `127.0.0.1` 本地 dev server；
- 修改源码后刷新目标网页即可加载最新代码；
- 通过 `cent-cdp-browser` 使用日常 Cent Profile 启动 CDP；
- AI 可用 CDP 读取 DOM、Console、Network、执行 JS、点击和验收；
- Chrome Extension 预留标准目录和配置位，暂不实现自动 reload/build。

## 快速开始

1. 修改 `workbench.config.json`：
   - `targetUrl`：真实调试页面；
   - `userscript.sourcePath`：真实 `.user.js` 路径，可以是绝对路径；
   - `browser.centCdpSkill`：可留空并通过环境变量 `CENT_CDP_SKILL` 指向本机 `cent-cdp-browser` Skill。
2. 生成开发 Loader：

```bat
npm run prepare:userscript
```

3. 把生成的 `runtime\WorkbenchDev.user.js` 安装到 Violentmonkey/Tampermonkey，一次即可。
4. 启动本地开发服务：

```bat
npm run dev:start
```

人工开发时也可以用前台模式 `npm run dev`。AI 调试默认用 `dev:start`，避免本地桥回收命令 session 后 8890 跟着消失。

5. 启动/复用日常 Cent 的 CDP 模式：

```bat
npm run browser
```

这一步会为工作台创建一个独立标签页，并用 `agent-browser --pin-tab` 锁定它；不会拿已有 ChatGPT/其他网页标签充当验收目标。

6. 验证 AI 能连接：

```bat
npm run browser:verify
```

之后开发循环就是：

```text
修改 userscript.sourcePath 指向的真实 .user.js
-> 保存
-> 刷新目标网页
-> AI 通过 CDP 验证
```

## 目录

```text
BrowserPluginWorkbench/
├─ workbench.config.json
├─ package.json
├─ targets/
│  ├─ userscript/
│  │  └─ main.user.js
│  └─ chrome-extension/
│     ├─ README.md
│     └─ manifest.json
├─ templates/
│  └─ dev-loader.template.user.js
├─ runtime/                 # 自动生成，不提交
├─ tools/
│  ├─ dev-server.js
│  ├─ generate-userscript-loader.js
│  ├─ start-browser.ps1
│  ├─ verify-browser.ps1
│  ├─ selftest.js
│  └─ smoke-test.js
└─ docs/
   ├─ AI_DEBUG_GUIDE.md
   └─ ARCHITECTURE.md
```

## 设计原则

- 先 Userscript MVP，不一次性引入 Vite/TypeScript/Playwright。
- 浏览器 Profile/CDP 启动不在本项目重复实现，优先复用 `cent-cdp-browser` Skill。
- 真机证据优先于静态猜测。
- 普通网页脚本改动必须先有复现，再做最小修复。
- Chrome 扩展后续接入时沿用同一套 CDP 真机验收，不重新造浏览器控制层。

详细规则见 `docs/AI_DEBUG_GUIDE.md`。

## 已验证案例

V0.1 已使用真实的大型 Userscript **My Prompt** 在 Cent Browser + Violentmonkey + ChatGPT 上完成真机验证：工作台直接服务原始 `.user.js`，Dev Loader 继承脚本元数据，通过 CDP 验证脚本实际注入后的 DOM 变化。详见 `docs/MY_PROMPT_CASE_STUDY.md`。
