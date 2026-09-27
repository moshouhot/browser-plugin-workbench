const fs = require("node:fs");
const path = require("node:path");
const { readConfig, validate, buildLoader, readSource, parseMetadata } = require("./generate-userscript-loader");

const ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function main() {
    const config = readConfig();
    validate(config);
    const { sourcePath, source } = readSource(config);
    const metadata = parseMetadata(source);

    assert(config.devServer.host === "127.0.0.1", "devServer.host must default to loopback");
    assert(Number.isInteger(Number(config.devServer.port)), "devServer.port must be numeric");
    assert(Number.isInteger(Number(config.browser.cdpPort)), "browser.cdpPort must be numeric");
    assert(Boolean(config.browser.agentSession), "browser.agentSession is required");
    assert(config.chromeExtension && Object.hasOwn(config.chromeExtension, "enabled"), "chromeExtension reservation missing");

    const loader = buildLoader(config);
    assert(loader.includes("GM_xmlhttpRequest"), "generated loader missing GM_xmlhttpRequest");
    assert(loader.includes(`127.0.0.1:${config.devServer.port}/userscript`), "generated loader points at wrong server");
    assert(loader.includes("Browser Plugin Workbench Example [Workbench Dev]"), "dev loader did not isolate the example script name");
    assert(loader.includes(".workbench-dev"), "dev loader namespace is not isolated");
    assert(loader.includes("@grant        GM_xmlhttpRequest"), "dev loader did not inherit the example grant");
    assert(loader.includes("@inject-into         content"), "dev loader must force Violentmonkey content context");
    assert(loader.includes("@sandbox             DOM"), "dev loader must request Tampermonkey DOM sandbox");
    assert(!loader.includes("@downloadURL"), "dev loader must remove @downloadURL");
    assert(!loader.includes("@updateURL"), "dev loader must remove @updateURL");
    assert(loader.includes("eval(response.responseText"), "dev loader must use direct eval in userscript sandbox");
    assert(sourcePath.endsWith(path.join("targets", "userscript", "main.user.js")), "selftest is not pointed at the bundled example source");
    assert(metadata.some((line) => line.includes("@match") && line.includes("example.com")), "example source metadata missing example.com match");

    for (const relative of [
        "tools/dev-server.js",
        "tools/start-browser.ps1",
        "tools/verify-browser.ps1",
        "targets/chrome-extension/manifest.json",
        "docs/AI_DEBUG_GUIDE.md"
    ]) {
        assert(fs.existsSync(path.join(ROOT, relative)), `missing required file: ${relative}`);
    }

    console.log("[workbench] SELFTEST PASS");
}

main();
