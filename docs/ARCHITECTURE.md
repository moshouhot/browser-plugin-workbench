# Architecture

## V0.1

```text
                     +--------------------------+
                     | cent-cdp-browser Skill   |
                     | daily Cent + CDP         |
                     +------------+-------------+
                                  |
                                  v
+------------------+      +-------+-------+
| source userscript| ---> | target website |
+--------+---------+      +-------+-------+
         ^                        |
         |                        v
+--------+---------+      +-------+-------+
| local dev server |      | AI CDP attach |
| 127.0.0.1:8890   |      | agent-browser |
+--------+---------+      +---------------+
         ^
         |
+--------+---------+
| thin dev loader  |
| Violentmonkey    |
+------------------+
```

### Userscript

完整实现。

### Chrome Extension

只预留目标目录和配置。未来接入 reload/build/service worker 调试时，不修改浏览器控制层。

## Why no framework yet

第一版不引入 Vite/TypeScript/Playwright，因为当前主要问题是浏览器插件的真实运行与调试闭环，而不是构建系统。

当出现以下任一情况再升级：

- 多模块源码维护明显困难；
- 需要 TypeScript 类型约束；
- Chrome Extension 正式启用；
- 自动回归用例数量足以支撑 Playwright/测试框架成本。
