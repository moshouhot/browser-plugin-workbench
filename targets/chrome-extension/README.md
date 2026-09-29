# Chrome Extension target (reserved)

此目录是 Chrome Extension 的预留入口。

当前 V0.2.1：

- 保留 Manifest V3 标准目录；
- 可以手工“加载已解压的扩展程序”验证目录是否有效；
- 工作台暂不实现自动 build、自动 reload、HMR；
- 后续实现时继续复用同一个 Cent/CDP 控制层，不新建另一套浏览器调试框架。

建议后续功能顺序：

1. CDP 检查已加载扩展；
2. 一键 reload extension；
3. background/service worker Console；
4. content script 注入验证；
5. 再考虑 Vite/TypeScript 构建链。
