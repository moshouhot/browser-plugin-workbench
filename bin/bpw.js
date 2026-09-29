#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { ROOT, loadConfig, resolveSourcePath } = require("../tools/config");
const { metadataIdentity } = require("../tools/source-identity");
const violentmonkey = require("../tools/violentmonkey");

const RUNTIME = path.join(ROOT, "runtime");
const SESSION_PATH = path.join(RUNTIME, "session.json");
const BROWSER_STATE = path.join(RUNTIME, "browser-session.json");
const LOADER_PATH = path.join(RUNTIME, "WorkbenchDev.user.js");
const FORMAL_BACKUP = path.join(RUNTIME, "formal-before-bpw.user.js");
const OPERATION_LOCK = path.join(RUNTIME, "operation.lock");

function usage() {
    return `Browser Plugin Workbench

Usage:
  bpw doctor [--json]
  bpw start [--request <json>] [--source <file>] [--url <url>] [--manual-loader] [--json]
  bpw status [--json]
  bpw finish [--json]
  bpw stop [--json]

AI should use agent-browser directly after 'bpw start' for page debugging.`;
}

async function tryFastBrowserReuse(config, targetUrl) {
    const cached = readJson(BROWSER_STATE);
    const port = Number(config.browser.cdpPort);
    if (!cached || Number(cached.cdpPort) !== port || !cached.browserWebSocketDebuggerUrl) return null;
    const version = await httpJson(`http://127.0.0.1:${port}/json/version`, 350);
    if (!version?.webSocketDebuggerUrl || version.webSocketDebuggerUrl !== cached.browserWebSocketDebuggerUrl) return null;
    const browser = {
        ...cached,
        targetUrl,
        action: "reuse-fast",
        startedAt: new Date().toISOString()
    };
    writeJson(BROWSER_STATE, browser);
    return browser;
}

async function bootstrapBrowser(config, env, targetUrl) {
    if (process.platform !== "win32") throw new Error("V0.2 browser bootstrap currently requires Windows");
    const reused = await tryFastBrowserReuse(config, targetUrl);
    if (reused) return reused;
    const centRoot = config.browser?.centCdpSkill || "";
    const starter = path.join(centRoot, "scripts", "start_cent_cdp.py");
    if (!centRoot || !fs.existsSync(starter)) {
        throw new Error(`cent-cdp-browser starter not found: ${starter}`);
    }
    const pythonEnv = { ...env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
    const result = spawnSync("python", [
        starter,
        "--url", targetUrl,
        "--port", String(config.browser.cdpPort)
    ], {
        cwd: ROOT,
        env: pythonEnv,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        throw new Error(`cent-cdp-browser failed${details ? `:\n${details}` : ""}`);
    }
    let value;
    try { value = JSON.parse(String(result.stdout || "").trim()); }
    catch { throw new Error("cent-cdp-browser did not return parseable JSON"); }
    const version = await httpJson(`http://127.0.0.1:${Number(value.cdp_port || config.browser.cdpPort)}/json/version`, 1000);
    if (!version?.webSocketDebuggerUrl) throw new Error("cent-cdp-browser returned success but CDP version is unavailable");
    const browser = {
        cdpPort: Number(value.cdp_port || config.browser.cdpPort),
        targetUrl,
        agentSession: config.browser.agentSession || "browser-plugin-workbench",
        action: String(value.action || ""),
        browser: String(value.browser || ""),
        userData: String(value.user_data || ""),
        profile: String(value.profile || ""),
        browserWebSocketDebuggerUrl: version.webSocketDebuggerUrl,
        startedAt: new Date().toISOString()
    };
    writeJson(BROWSER_STATE, browser);
    return browser;
}

async function restoreVmSession(session) {
    if (!session?.vm) return;
    if (session.vm.transport !== "background-api") {
        throw new Error("this BPW session uses an unsupported legacy Violentmonkey UI transport; UI fallback is disabled");
    }
    if (!await violentmonkey.hasBackgroundApi(session.cdpPort, session.vm.extensionId)) {
        throw new Error("Violentmonkey background API is unavailable; UI fallback is disabled");
    }
    await violentmonkey.restoreBackground(session.cdpPort, session.vm.extensionId, session.vm);
}

async function reloadVmTarget(session) {
    if (!session?.targetId) throw new Error("BPW target id is missing; refusing legacy browser fallback");
    await violentmonkey.reloadTargetById(session.cdpPort, session.targetId);
}

async function finishVmSession(session, sourceCode, originalCode) {
    if (session.vm.transport !== "background-api") {
        throw new Error("this BPW session uses an unsupported legacy Violentmonkey UI transport; UI fallback is disabled");
    }
    if (!await violentmonkey.hasBackgroundApi(session.cdpPort, session.vm.extensionId)) {
        throw new Error("Violentmonkey background API is unavailable; UI fallback is disabled");
    }
    return violentmonkey.finishBackground(
        session.cdpPort,
        session.vm.extensionId,
        session.vm,
        sourceCode,
        originalCode
    );
}

function applyRequestOptions(command, options) {
    if (!options.request) return options;
    if (command !== "start") throw new Error("--request is supported only by bpw start");
    const requestPath = path.resolve(options.request);
    const request = readJson(requestPath);
    if (!request || Array.isArray(request) || typeof request !== "object") {
        throw new Error(`invalid BPW request JSON: ${requestPath}`);
    }
    const fromRequest = {};
    if (request.source != null) fromRequest.source = String(request.source);
    if (request.url != null) fromRequest.url = String(request.url);
    if (request.devPort != null) fromRequest["dev-port"] = String(request.devPort);
    if (request.cdpPort != null) fromRequest["cdp-port"] = String(request.cdpPort);
    if (request.session != null) fromRequest.session = String(request.session);
    if (request.manualLoader === true) fromRequest.manualLoader = true;
    return { ...fromRequest, ...options, request: requestPath };
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
        else if (arg === "--manual-loader") options.manualLoader = true;
        else if (["--request", "--source", "--url", "--dev-port", "--cdp-port", "--session"].includes(arg)) {
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

function writeJson(file, value) {
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, file);
}

function sha256(source) { return crypto.createHash("sha256").update(source).digest("hex"); }

function processExists(pid) {
    const value = Number(pid);
    if (!Number.isInteger(value) || value <= 0) return false;
    try {
        process.kill(value, 0);
        return true;
    } catch (error) {
        if (error.code === "ESRCH") return false;
        if (error.code === "EPERM") return true;
        throw error;
    }
}

function readOperationLock() {
    try {
        const value = JSON.parse(fs.readFileSync(OPERATION_LOCK, "utf8").replace(/^\uFEFF/, ""));
        return value && typeof value === "object" ? value : null;
    } catch {
        return null;
    }
}

function sameLockOwner(left, right) {
    return Boolean(left && right
        && left.pid === right.pid
        && left.token === right.token
        && left.startedAt === right.startedAt);
}

function describeOperationLock(owner) {
    if (!owner) return `another BPW operation is running or lock metadata is unreadable: ${OPERATION_LOCK}`;
    const operation = owner.operation || "unknown";
    const startedAt = owner.startedAt || "unknown time";
    return `another BPW operation is running (${operation}, pid ${owner.pid}, started ${startedAt}): ${OPERATION_LOCK}`;
}

function reclaimStaleOperationLock(owner) {
    if (!owner || processExists(owner.pid)) return false;
    const current = readOperationLock();
    if (!sameLockOwner(owner, current)) return false;
    fs.rmSync(OPERATION_LOCK, { force: true });
    return true;
}

async function withOperationLock(operationName, operation) {
    fs.mkdirSync(RUNTIME, { recursive: true });
    let handle;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            handle = fs.openSync(OPERATION_LOCK, "wx");
            break;
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            const owner = readOperationLock();
            if (attempt === 0 && reclaimStaleOperationLock(owner)) continue;
            throw new Error(describeOperationLock(owner));
        }
    }
    if (handle == null) throw new Error(`could not acquire BPW operation lock: ${OPERATION_LOCK}`);
    const owner = {
        pid: process.pid,
        operation: operationName,
        startedAt: new Date().toISOString(),
        token: crypto.randomUUID()
    };
    try {
        fs.writeSync(handle, JSON.stringify(owner));
        return await operation();
    } finally {
        try { fs.closeSync(handle); }
        finally {
            if (sameLockOwner(owner, readOperationLock())) fs.rmSync(OPERATION_LOCK, { force: true });
        }
    }
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
    if (fs.existsSync(SESSION_PATH)) throw new Error("an existing BPW session must be finished or stopped before starting another");
    if (fs.existsSync(FORMAL_BACKUP)) throw new Error(`unresolved formal script backup exists: ${FORMAL_BACKUP}`);
    fs.mkdirSync(RUNTIME, { recursive: true });
    run(process.execPath, [path.join(ROOT, "tools", "generate-userscript-loader.js")], env, "loader generation");
    run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "start"], env, "dev server start");

    let browser;
    try {
        browser = await bootstrapBrowser(config, env, targetUrl);
    } catch (error) {
        run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server cleanup");
        throw error;
    }

    const session = {
        source,
        targetUrl,
        devServer: `http://${config.devServer.host || "127.0.0.1"}:${config.devServer.port}`,
        loader: LOADER_PATH,
        cdpPort: browser.cdpPort || config.browser.cdpPort,
        agentSession: browser.agentSession || config.browser.agentSession || "browser-plugin-workbench",
        targetId: "",
        targetCdpUrl: "",
        browser: browser.browser || "",
        startedAt: new Date().toISOString()
    };
    try {
        let target = browser.action === "start"
            ? await violentmonkey.findTargetByUrl(session.cdpPort, targetUrl)
            : null;
        if (!target) target = await violentmonkey.createTarget(session.cdpPort, targetUrl);
        session.targetId = target.id;
        session.targetCdpUrl = target.webSocketDebuggerUrl;
        session.targetUrl = target.url || targetUrl;
    } catch (error) {
        run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server cleanup");
        fs.rmSync(BROWSER_STATE, { force: true });
        throw error;
    }
    writeJson(SESSION_PATH, session);

    if (!options.manualLoader) {
        try {
            const extensionId = await violentmonkey.findExtensionId(session.cdpPort);
            const sourceCode = fs.readFileSync(source, "utf8");
            const loaderCode = fs.readFileSync(LOADER_PATH, "utf8");
            const identity = metadataIdentity(sourceCode);
            const loaderIdentity = metadataIdentity(loaderCode);
            if (!await violentmonkey.hasBackgroundApi(session.cdpPort, extensionId)) {
                throw new Error("Violentmonkey background API is unavailable; UI fallback is disabled");
            }
            const inspected = await violentmonkey.inspectBackground(session.cdpPort, extensionId, identity, loaderIdentity);
            if (inspected.formal) fs.writeFileSync(FORMAL_BACKUP, inspected.formal.code, { flag: "wx" });
            session.vm = {
                extensionId,
                transport: "background-api",
                stage: "preparing",
                identity,
                loaderIdentity,
                sourceHash: sha256(sourceCode),
                formal: inspected.formal && {
                    id: inspected.formal.id,
                    enabled: inspected.formal.enabled,
                    codeHash: sha256(inspected.formal.code)
                },
                loader: inspected.loader && { id: inspected.loader.id, enabled: inspected.loader.enabled }
            };
            writeJson(SESSION_PATH, session);
            const activated = await violentmonkey.activateBackground(session.cdpPort, extensionId, session.vm, loaderCode);
            session.vm.loaderId = activated.loaderId;
            session.vm.stage = "active";
            writeJson(SESSION_PATH, session);
            await reloadVmTarget(session);
        } catch (error) {
            if (session.vm) {
                try { await restoreVmSession(session); }
                catch (restoreError) {
                    session.vm.stage = "restore-needed";
                    writeJson(SESSION_PATH, session);
                    throw new Error(`${error.message}; automatic restoration failed: ${restoreError.message}. Run bpw stop to retry`);
                }
            }
            run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server cleanup");
            await violentmonkey.closeTargetById(session.cdpPort, session.targetId);
            fs.rmSync(SESSION_PATH, { force: true });
            fs.rmSync(BROWSER_STATE, { force: true });
            fs.rmSync(FORMAL_BACKUP, { force: true });
            throw error;
        }
    }

    if (options.json) emit({ status: "READY", ...session }, true);
    else {
        console.log("READY");
        emit(session, false);
        console.log(`agentBrowser: npx -y agent-browser --session ${session.agentSession} --cdp ${session.targetCdpUrl || session.cdpPort} --pin-tab ...`);
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
    const lifecycleReady = !session.vm || (session.vm.stage === "active" && Boolean(cdp?.webSocketDebuggerUrl));
    const result = {
        status: sourceMatches && lifecycleReady ? "ACTIVE" : "DEGRADED",
        source: session.source,
        targetUrl: session.targetUrl,
        devServer: session.devServer,
        devServerReady: sourceMatches,
        cdpPort: session.cdpPort,
        cdpReachable: Boolean(cdp && cdp.webSocketDebuggerUrl),
        agentSession: session.agentSession,
        targetId: session.targetId,
        targetCdpUrl: session.targetCdpUrl,
        loader: session.loader
    };
    if (session.vm) result.violentmonkey = { stage: session.vm.stage, formalId: session.vm.formal?.id || session.vm.formalId || null, loaderId: session.vm.loaderId || session.vm.loader?.id || null };
    emit(result, options.json);
    if (!sourceMatches || !lifecycleReady) process.exitCode = 1;
}

async function finish(options) {
    const session = readJson(SESSION_PATH);
    if (!session?.vm) throw new Error("no active Violentmonkey lifecycle; use bpw start without --manual-loader");
    if (session.vm.stage !== "promoted") {
        if (session.vm.stage !== "active") throw new Error(`cannot finish session in stage ${session.vm.stage}`);
        let backup = null;
        if (session.vm.formal) {
            backup = fs.readFileSync(FORMAL_BACKUP, "utf8");
            if (sha256(backup) !== session.vm.formal.codeHash) throw new Error("formal backup does not match the lifecycle journal");
        }
        const current = fs.readFileSync(session.source, "utf8");
        const finished = await finishVmSession(session, current, backup);
        session.vm.formalId = finished.formalId;
        session.vm.stage = "promoted";
        writeJson(SESSION_PATH, session);
    }
    await reloadVmTarget(session);
    run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], childEnv({ source: session.source }), "dev server stop");
    fs.rmSync(SESSION_PATH, { force: true });
    fs.rmSync(FORMAL_BACKUP, { force: true });
    emit({ status: "FINISHED", formalId: session.vm.formalId, browserLeftRunning: true }, options.json);
}

async function stop(options) {
    const session = readJson(SESSION_PATH);
    if (session?.vm) await restoreVmSession(session);
    if (session?.vm) await reloadVmTarget(session);
    const env = childEnv({ source: session?.source });
    run(process.execPath, [path.join(ROOT, "tools", "dev-server-control.js"), "stop"], env, "dev server stop");
    fs.rmSync(SESSION_PATH, { force: true });
    fs.rmSync(FORMAL_BACKUP, { force: true });
    emit({ status: "STOPPED", browserLeftRunning: true }, options.json);
}

async function main() {
    let { command, options } = parseArgs(process.argv.slice(2));
    if (!command || options.help) {
        console.log(usage());
        return;
    }
    options = applyRequestOptions(command, options);
    if (command === "doctor") await doctor(options);
    else if (command === "start") await withOperationLock("start", () => start(options));
    else if (command === "status") await status(options);
    else if (command === "finish") await withOperationLock("finish", () => finish(options));
    else if (command === "stop") await withOperationLock("stop", () => stop(options));
    else throw new Error(`unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
    console.error(`[bpw] ${error.message || error}`);
    process.exitCode = 1;
});
