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
- Violentmonkey：Userscript 运行环境。

BPW 不重复实现这些能力。

## CLI

V0.2 只有 4 个公开命令：

```text
bpw doctor
bpw start
bpw status
bpw stop
```

本地仓库可直接运行：

```bat
npm run bpw -- doctor
```

也可以在仓库执行一次：

```bat
npm link
```

之后直接使用：

```bat
bpw doctor
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
-> bpw start --source ... --url ...
-> AI 直接使用 agent-browser 调试/修改/验证
-> bpw stop
```

Skill 不包含 BPW 的第二份实现，CLI 才是唯一执行层。

## 开始调试现有 Userscript

例如：

```bat
bpw start --source "D:\project\foo.user.js" --url "https://target.example/"
```

BPW 会：

1. 读取真实 `.user.js`；
2. 生成独立 Dev Loader；
3. 启动 `127.0.0.1` source server；
4. 调用 `cent-cdp-browser`；
5. 用 `agent-browser` 创建并 pin 一个专属 target；
6. 返回 CDP、session、source、loader 等信息。

然后 AI 不再通过 BPW 绕一层，而是直接使用：

```text
agent-browser + 返回的 session/CDP
```

去完成刷新、DOM 检查、Console/Network 分析、点击、JS、截图以及针对当前 bug 的验证。

## 第一次使用 Dev Loader

生成位置：

```text
runtime\WorkbenchDev.user.js
```

把它安装进 Violentmonkey/Tampermonkey 一次即可。

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
BPW_DEV_PORT
BPW_CDP_PORT
BPW_AGENT_SESSION
CENT_CDP_SKILL
```

CLI 的 `--source` / `--url` 优先级高于配置文件。

## 查看状态与结束

```bat
bpw status
bpw stop
```

`stop` 只停止经过身份验证的 BPW source server，并删除 BPW 自己的 session state。

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
