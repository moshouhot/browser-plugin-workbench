# Browser Plugin Workbench

一个给强 AI 使用的、小而美的真实浏览器插件开发工作台。

BPW 不负责替 AI 分析 DOM、Console、Network，也不做通用测试框架。它只负责把真实开发现场准备好：

```text
真实 .user.js
-> Dev Loader + localhost source server
-> 日常 Cent Profile + CDP
-> 专属 target tab
-> AI 直接使用 agent-browser 调试
```

## 核心理念

> AI 负责判断，BPW 负责机械且容易出错的环境搭桥。

BPW 优先复用：

- `cent-cdp-browser`：启动/复用日常 Cent Profile 和 CDP；
- `agent-browser`：DOM、Console、Network、点击、JS、截图、刷新等浏览器操作；
- Violentmonkey / Tampermonkey：Userscript 运行环境。

BPW 不重复实现这些能力。

## CLI

源码工作区提供以下命令：

```text
bpw doctor
bpw start
bpw status
bpw finish
bpw stop
```

### 检测是否已安装 CLI

Windows 下先运行：

```bat
where.exe bpw
```

如果能找到 `bpw`，继续：

```bat
bpw doctor
```

### 安装 / 链接 CLI

普通使用 / AI 自动安装，推荐安装已经验收过的稳定 Tag：

```bat
npm install -g github:moshouhot/browser-plugin-workbench#v0.2.0
```

然后确认：

```bat
where.exe bpw
bpw doctor
```

如果你是在**开发 BPW 本身**，才使用源码仓库 + `npm link`。如果已经在 BrowserPluginWorkbench 源码仓库里：

```bat
npm link
```

或者先克隆开发仓库：

```bat
git clone https://github.com/moshouhot/browser-plugin-workbench.git
cd browser-plugin-workbench
npm link
```

开发模式同样用下面命令确认：

```bat
where.exe bpw
bpw doctor
```

目前没有发布 npm Registry 包，因此不要使用 `npm install -g browser-plugin-workbench`。普通安装以 **GitHub Tag + npm** 为准，源码 clone + `npm link` 只保留给开发 BPW 本身。

升级到后续稳定版时，仍使用相同形式，例如：

```bat
npm install -g github:moshouhot/browser-plugin-workbench#v0.2.1
```

卸载：

```bat
npm uninstall -g browser-plugin-workbench
```

如果只想在当前源码仓库临时运行、不做全局 link，也可以：

```bat
npm run bpw -- doctor
```

## AI Skill（推荐）

CLI 可以独立使用；给 Codex / ChatGPT 这类 AI 使用时，推荐再安装薄 Skill：

```text
browser-plugin-workbench
```

它只负责告诉 AI 正确工作流：

```text
$browser-plugin-workbench
-> bpw doctor
-> 写一个临时 request JSON（source + url）
-> bpw start --request runtime\start-request.json
-> AI 直接使用 agent-browser 调试/修改/验证
-> bpw finish（验收通过并更新正式版）或 bpw stop（放弃本次调试）
```

Skill 不包含 BPW 的第二份实现，CLI 才是唯一执行层。

## 开始调试现有 Userscript

AI/Codex 默认使用 request 文件，避免把目标 URL 直接暴露在命令行里：

```json
{
  "source": "D:\\project\\foo.user.js",
  "url": "https://target.example/",
  "manager": "violentmonkey"
}
```

```bat
bpw start --request runtime\start-request.json
```

人工终端仍兼容 `bpw start --source "..." --url "..."`，但自动化/Codex 不应把字面 URL 放进 `bpw start` 命令行；部分命令执行策略会在 CreateProcess 前误拦这种命令形状。

`manager` 默认是 `violentmonkey`。同一 Profile 同时安装多个 Userscript 管理器时不要自动猜测；要调试 Tampermonkey 时显式使用：

```json
{
  "source": "D:\\project\\foo.user.js",
  "url": "https://target.example/",
  "manager": "tampermonkey"
}
```

BPW 会：

1. 读取真实 `.user.js`；
2. 生成独立 Dev Loader；
3. 启动 `127.0.0.1` source server；
4. 调用 `cent-cdp-browser`；
5. 通过 Chrome CDP 直接创建或复用专属 target；
6. 按显式 manager 执行 Userscript 生命周期：Violentmonkey 使用其后台 API；Tampermonkey 使用官方 External userscripts API 做源码 CRUD，仅用内部 `loadTree` / `modifyScriptOptions` 补启停能力；任一所需能力不可用都立即报错，不回退管理页 UI；
7. 通过 CDP 直接刷新目标页；
8. 返回 `targetId`、`targetCdpUrl`、CDP、session、source、loader 等信息。

默认要求当前 Cent Profile 中可通过 CDP 访问 Violentmonkey。BPW 在修改脚本状态前保存正式脚本源码和原启用状态。调试时只修改原始 `.user.js` 文件；Dev Loader 会从本地服务读取最新文件。

### Tampermonkey 后端

Tampermonkey 必须显式选择 `manager: "tampermonkey"`。BPW 不使用 Dashboard UI 自动化，也不调用私有 `saveScript` 来补官方能力缺口：

- 源码读取/更新/创建/删除：Tampermonkey Editors 转发的官方 External `userscripts` API（`list/get/patch/put/delete`）；
- 脚本启停：Tampermonkey 自己扩展页上下文中的 `loadTree` + `modifyScriptOptions`；
- 启动前会同时探测两条通道，缺少任一能力就 fail closed。

Tampermonkey Editors 不要求用户手工安装，也不要求首次联网下载。BPW 仓库直接内置固定版本的官方 **Tampermonkey Editors 1.0.7** companion：

```text
vendor/tampermonkey-editors/
```

BPW 的 `ensureEditors()` 会：

1. 优先复用当前 Profile 已经可用的官方 Tampermonkey Editors；
2. 如果不存在，则校验仓库内置 companion 的版本、上游 commit、MIT 许可和 `manifest.key`；
3. `manifest.key` 必须派生出官方白名单 ID `lieodnapokbjkkdkhdljlllmgkmdokcm`，否则立即停止；
4. 由 `cent-cdp-browser` 在 Cent 启动时加载内置 companion；
5. 再验证实际运行时 extension ID，之后才允许 External API 继续。

内置副本固定自上游 tag `1.0.7` / commit `cabbb288f5d7b7734c4ff88a4cefef97d301c633`。BPW 不修改 Editors 业务逻辑，只在 manifest 中保留从官方 CRX3 提取并验证过的公开 `key`，使 unpacked companion 继续使用官方 ID。第三方许可证保留在 vendor 目录内。

如果 Cent 已经在运行且本次启动参数中没有内置 Editors，Chrome 不能热加载新的 `--load-extension`。这种情况下 `cent-cdp-browser` 会沿用它原有的受控重启流程，让 Editors 在浏览器启动阶段加载；不要求用户去商店安装扩展。

完整自动生命周期仍要求 Tampermonkey External API 实际声明 `list/get/patch/put/delete`。Tampermonkey 5.5.0 只声明 `list/get/patch`，即使 Editors 已自动准备完成也会安全拒绝源码 CRUD；不会偷偷改用内部 `saveScript`。

若使用其他 Userscript 管理器，可显式运行 `bpw start ... --manual-loader`，沿用手动安装 Loader 的流程。该模式不支持 `bpw finish` 自动回写。

然后 AI 不再通过 BPW 绕一层，而是直接使用：

```text
agent-browser + 返回的 targetCdpUrl/session
```

去完成刷新、DOM 检查、Console/Network 分析、点击、JS、截图以及针对当前 bug 的验证。

## 第一次使用 Dev Loader

生成位置：

```text
runtime\WorkbenchDev.user.js
```

默认的 Violentmonkey 流程只通过扩展自身后台命令安装或更新它，不打开管理页或 CodeMirror。后台接口不可用时 BPW 会报错停止；不会自动回退 UI。`--manual-loader` 是用户显式选择的独立模式，才需要自行安装 Loader。

Loader 继承原脚本需要的 Userscript metadata，并使用独立开发身份，不覆盖正式脚本。BPW 停止后本地 server 不存在时，Loader 会安静地跳过，不在正常浏览时刷连接错误。

## 本机配置

公开的 `workbench.config.json` 只提供通用默认值，不保存私人机器路径。

本机 `cent-cdp-browser` 路径使用环境变量：

```bat
set CENT_CDP_SKILL=F:\path\to\cent-cdp-browser
```

常用临时覆盖：

```text
BPW_SOURCE
BPW_TARGET_URL
BPW_USERSCRIPT_MANAGER
BPW_DEV_PORT
BPW_CDP_PORT
BPW_AGENT_SESSION
CENT_CDP_SKILL
```

CLI 的 `--request` 适合 AI/Codex；`--source` / `--url` 仍作为人工终端兼容入口。显式 CLI 参数优先级高于 request，request 优先级高于配置文件。

## 查看状态与结束

```bat
bpw status
bpw finish
bpw stop
```

`finish` 将当前源文件写回所选 Userscript 管理器中的正式脚本，核对脚本 ID 和源码，启用正式版、关闭 Dev Loader，刷新目标页并停止本地服务。若正式脚本在调试期间被其他操作改动，BPW 拒绝覆盖，并保留会话供处理。

`stop` 放弃回写，关闭 Dev Loader，恢复正式脚本调试开始前的启用状态，刷新目标页并停止本地服务。恢复失败时保留会话，可再次运行 `bpw stop`。

若 BPW 进程被强制结束，下一条生命周期命令会检查 `operation.lock` 的 owner PID：活 PID 继续阻止并发操作，dead PID 的 stale lock 会自动回收，正常不需要手工删除锁文件。

旧 Dev Loader 在下一次工作台调试不同源码时会收到 HTTP 409，不能误加载另一份脚本。

它**不会**杀掉 Cent，也不会清 Profile/Cookie，更不会操作其他浏览器进程。

## BPW 明确不做

- `bpw inspect / console / network / verify`；
- 自己实现 CDP/browser automation；
- 通用 assertion/测试 DSL；
- GUI；
- MCP server；
- 数据库/daemon/cloud；
- Chrome Extension 构建框架；
- AI bug diagnosis。

这些要么交给强 AI，要么直接复用成熟工具。

## 验证

```bat
npm run check
npm test
```

真实浏览器验收仍以外部 Userscript + 日常 Cent + Violentmonkey + 真实目标站点为准。

详细设计边界见：

- `PRD.md`
- `DESIGN.md`
- `IMPLEMENTATION_PLAN.md`
- `ACCEPTANCE.md`
