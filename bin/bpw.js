#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { ROOT, loadConfig, resolveSourcePath } = require("../tools/config");

const RUNTIME = path.join(ROOT, "runtime");
const SESSION_PATH = path.join(RUNTIME, "session.json");
const BROWSER_STATE = path.join(RUNTIME, "browser-session.json");
const LOADER_PATH = path.join(RUNTIME, "WorkbenchDev.user.js");

function usage() {
    return `Browser Plugin Workbench

Usage:
  bpw doctor [--json]
  bpw start [--source <file>] [--url <url>] [--json]
  bpw status [--json]
  bpw stop [--json]

AI should use agent-browser directly after 'bpw start' for page debugging.`;
}

function parseArgs(argv) {
    if (!argv[0] || argv[0] === "--help" || argv[0] === "-h") {
        return { command: null, options: { json: false, help: true } };
    }
    const command = argv[0];
    const options = { json: false };
    for (let i = 1; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--json") options.json = true;
        else if (["--source", "--url", "--dev-port", "--cdp-port", "--session"].includes(arg)) {
            if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
            options[arg.slice(2)] = argv[++i];
        } else if (arg === "--help" || arg === "-h") options.help = true;
        else throw new Error(`unknown option: ${arg}`);
    }
    return { command, options };
}

function childEnv(options = {}) {
    const env = { ...process.env };
    if (options.source) env.BPW_SOURCE = path.resolve(options.source);
    if (options.url) env.BPW_TARGET_URL = options.url;
    if (options["dev-port"]) env.BPW_DEV_PORT = options["dev-port"];
    if (options["cdp-port"]) env.BPW_CDP_PORT = options["cdp-port"];
    if (options.session) env.BPW_AGENT_SESSION = options.session;
    return env;
}

function run(exe, args, env, label) {
    const result = spawnSync(exe, args, { cwd: ROOT, env, encoding: "utf8", windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        throw new Error(`${label} failed${details ? `:\n${details}` : ""}`);
    }
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function commandExists(command) {
    const exe = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(exe, [command], { encoding: "utf8", windowsHide: true });
    return result.status === 0;
}

function httpJson(url, timeout = 1000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                try { resolve(res.statusCode === 200 ? JSON.parse(body) : null); }
                catch { resolve(null); }
            });
        });
        req.on("timeout", () => { req.destroy(); resolve(null); });
        req.on("error", () => resolve(null));
    });
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
    catch { return null; }
}

function emit(value, json) {
    if (json) {
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        return;
    }
    if (typeof value === "string") console.log(value);
    else for (const [key, item] of Object.entries(value)) console.log(`${key}: ${item ?? ""}`);
}

async function doctor(options) {
    const env = childEnv(options);
    const config = loadConfig(env);
    const source = resolveSourcePath(config);
    const centRoot = config.browser?.centCdpSkill || "";
    const checks = {
        source: fs.existsSync(source),
        loopback: (config.devServer?.host || "127.0.0.1") === "127.0.0.1",
        node: true,
        npx: commandExists("npx"),
        python: commandExists("python"),
        powershell: process.platform !== "win32" || commandExists("powershell.exe"),
        centCdpConfigured: Boolean(centRoot && fs.existsSync(path.join(centRoot, "scripts", "start_cent_cdp.py")))
    };
    const coreReady = checks.source && checks.loopback && checks.node && checks.npx;
    const result = { status: coreReady ? (checks.centCdpConfigured ? "READY" : "READY_WITH_WARNING") : "FAIL", source, checks };
    emit(result, options.json);
    if (!coreReady) process.exitCode = 1;
}

async function start(options) {
    const env = childEnv(options);
    const config = loadConfig(env);
    const source = resolveSourcePath(config);
    const targetUrl = config.targetUrl;
    if (!fs.existsSync(source)) throw new Error(`userscript source not found: ${source}`);
    if (!targetUrl) throw new Error("target URL is required");

    fs.mkdirSync(RUNTIME, { recursive: true });
    run(process.execPath, [path.join(ROOT, "tools", "generate-userscript-loader.js")], env, "loader generation");
    run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "start"], env, "dev server start");

    try {
        if (process.platform !== "win32") throw new Error("V0.2 browser bootstrap currently requires Windows");
        run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "tools", "start-browser.ps1")], env, "browser bootstrap");
    } catch (error) {
        run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server cleanup");
        throw error;
    }

    const browser = readJson(BROWSER_STATE) || {};
    const session = {
        source,
        targetUrl,
        devServer: `http://${config.devServer.host || "127.0.0.1"}:${config.devServer.port}`,
        loader: LOADER_PATH,
        cdpPort: browser.cdpPort || config.browser.cdpPort,
        agentSession: browser.agentSession || config.browser.agentSession || "browser-plugin-workbench",
        browser: browser.browser || "",
        startedAt: new Date().toISOString()
    };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), "utf8");

    if (options.json) emit({ status: "READY", ...session }, true);
    else {
        console.log("READY");
        emit(session, false);
        console.log(`agentBrowser: npx -y agent-browser --session ${session.agentSession} --cdp ${session.cdpPort} --pin-tab ...`);
    }
}

async function status(options) {
    const session = readJson(SESSION_PATH);
    if (!session) {
        emit({ status: "STOPPED", message: "no BPW session state" }, options.json);
        process.exitCode = 1;
        return;
    }
    const server = await httpJson(`${session.devServer}/healthz`);
    const cdp = await httpJson(`http://127.0.0.1:${session.cdpPort}/json/version`);
    const sourceMatches = Boolean(server && server.app === "browser-plugin-workbench" && path.normalize(server.source || "") === path.normalize(session.source));
    const result = {
        status: sourceMatches ? "ACTIVE" : "DEGRADED",
        source: session.source,
        targetUrl: session.targetUrl,
        devServer: session.devServer,
        devServerReady: sourceMatches,
        cdpPort: session.cdpPort,
        cdpReachable: Boolean(cdp && cdp.webSocketDebuggerUrl),
        agentSession: session.agentSession,
        loader: session.loader
    };
    emit(result, options.json);
    if (!sourceMatches) process.exitCode = 1;
}

async function stop(options) {
    const session = readJson(SESSION_PATH);
    const env = childEnv({ source: session?.source });
    run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server stop");
    fs.rmSync(SESSION_PATH, { force: true });
    fs.rmSync(BROWSER_STATE, { force: true });
    emit({ status: "STOPPED", browserLeftRunning: true }, options.json);
}

async function main() {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (!command || options.help) {
        console.log(usage());
        return;
    }
    if (command === "doctor") await doctor(options);
    else if (command === "start") await start(options);
    else if (command === "status") await status(options);
    else if (command === "stop") await stop(options);
    else throw new Error(`unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
    console.error(`[bpw] ${error.message || error}`);
    process.exitCode = 1;
});
