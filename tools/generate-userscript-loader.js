const fs = require("node:fs");
const path = require("node:path");
const { ROOT, loadConfig, resolveSourcePath } = require("./config");
const RUNTIME_DIR = path.join(ROOT, "runtime");
const OUTPUT_PATH = path.join(RUNTIME_DIR, "WorkbenchDev.user.js");

function readConfig() {
    return loadConfig();
}

function readSource(config) {
    const sourcePath = resolveSourcePath(config);
    if (!fs.existsSync(sourcePath)) throw new Error(`userscript source not found: ${sourcePath}`);
    return { sourcePath, source: fs.readFileSync(sourcePath, "utf8") };
}

function parseMetadata(source) {
    const match = source.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
    if (!match) throw new Error("Userscript metadata block not found");
    return match[0].split(/\r?\n/);
}

function hasDirective(lines, key) {
    return lines.some((line) => new RegExp(`^\\s*//\\s*@${key}\\b`, "i").test(line));
}

function transformMetadata(lines, config) {
    const nameSuffix = config.userscript?.nameSuffix ?? " [Workbench Dev]";
    const namespaceSuffix = config.userscript?.namespaceSuffix ?? ".workbench-dev";
    let sawName = false;
    let sawNamespace = false;
    let sawLoopback = false;
    let sawLocalhost = false;
    let sawInjectInto = false;
    let sawSandbox = false;

    const output = [];
    for (const line of lines) {
        if (/^\s*\/\/\s*@(downloadURL|updateURL)\b/i.test(line)) continue;

        if (/^\s*\/\/\s*@name\s+/i.test(line) && !/^\s*\/\/\s*@name:/i.test(line)) {
            const value = line.replace(/^\s*\/\/\s*@name\s+/i, "").trim();
            output.push(`// @name                ${value}${nameSuffix}`);
            sawName = true;
            continue;
        }

        if (/^\s*\/\/\s*@namespace\s+/i.test(line)) {
            const value = line.replace(/^\s*\/\/\s*@namespace\s+/i, "").trim();
            output.push(`// @namespace           ${value}${namespaceSuffix}`);
            sawNamespace = true;
            continue;
        }

        if (/^\s*\/\/\s*@version\s+/i.test(line)) {
            const value = line.replace(/^\s*\/\/\s*@version\s+/i, "").trim();
            output.push(`// @version             ${value}-dev`);
            continue;
        }

        if (/^\s*\/\/\s*@connect\s+127\.0\.0\.1\s*$/i.test(line)) sawLoopback = true;
        if (/^\s*\/\/\s*@connect\s+localhost\s*$/i.test(line)) sawLocalhost = true;
        if (/^\s*\/\/\s*@inject-into\b/i.test(line)) {
            if (!sawInjectInto) output.push("// @inject-into         content");
            sawInjectInto = true;
            continue;
        }
        if (/^\s*\/\/\s*@sandbox\b/i.test(line)) {
            if (!sawSandbox) output.push("// @sandbox             DOM");
            sawSandbox = true;
            continue;
        }

        if (/^\s*\/\/\s*==\/UserScript==\s*$/i.test(line)) {
            if (!sawLoopback) output.push("// @connect             127.0.0.1");
            if (!sawLocalhost) output.push("// @connect             localhost");
            if (!sawInjectInto) output.push("// @inject-into         content");
            if (!sawSandbox) output.push("// @sandbox             DOM");
        }

        output.push(line);
    }

    if (!sawName || !sawNamespace) throw new Error("metadata must contain @name and @namespace");
    if (!hasDirective(output, "grant")) {
        throw new Error("metadata inheritance requires at least one @grant; use a real Userscript metadata block");
    }
    return output;
}

function validate(config) {
    if (!config.userscript?.enabled) throw new Error("userscript.enabled is false");
    if (!config.devServer?.port) throw new Error("devServer.port is required");
    const { source } = readSource(config);
    const metadata = parseMetadata(source);
    if (!hasDirective(metadata, "match") && !hasDirective(metadata, "include")) {
        throw new Error("source userscript has no @match/@include rule");
    }
}

function buildLoader(config) {
    const { source } = readSource(config);
    const metadata = transformMetadata(parseMetadata(source), config).join("\n");
    const port = Number(config.devServer.port);

    return `${metadata}

(function () {
    "use strict";

    const url = "http://127.0.0.1:${port}/userscript?t=" + Date.now();

    GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 10000,
        onload(response) {
            if (response.status !== 200) {
                console.error("[BrowserPluginWorkbench] dev loader HTTP", response.status, url);
                return;
            }
            try {
                // Direct eval is intentional: keep execution inside the userscript
                // sandbox so inherited GM_* APIs and @require globals remain visible.
                eval(response.responseText + "\\n//# sourceURL=browser-plugin-workbench-userscript.js");
            } catch (error) {
                console.error("[BrowserPluginWorkbench] userscript execution failed", error);
            }
        },
        // The loader is intentionally safe to leave installed. When BPW is
        // stopped, localhost is unavailable and normal browsing stays quiet.
        onerror() {},
        ontimeout() {}
    });
})();
`;
}

function main() {
    const config = readConfig();
    validate(config);
    const { sourcePath } = readSource(config);
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, buildLoader(config), "utf8");
    console.log(`[workbench] source: ${sourcePath}`);
    console.log(`[workbench] generated: ${OUTPUT_PATH}`);
    console.log("[workbench] install this loader once in Violentmonkey/Tampermonkey");
}

if (require.main === module) main();

module.exports = {
    readConfig,
    resolveSourcePath,
    readSource,
    parseMetadata,
    transformMetadata,
    validate,
    buildLoader,
    OUTPUT_PATH
};
