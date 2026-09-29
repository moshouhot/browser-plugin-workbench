const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BPW = path.join(ROOT, "bin", "bpw.js");
const CONTROL = path.join(ROOT, "tools", "dev-server-control.js");
const LOADER = path.join(ROOT, "tools", "generate-userscript-loader.js");
const { sourceIdentity } = require("./source-identity");
const RUNTIME = path.join(ROOT, "runtime");
const SERVER_STATE = path.join(RUNTIME, "dev-server.json");
const BROWSER_STATE = path.join(RUNTIME, "browser-session.json");
const OPERATION_LOCK = path.join(RUNTIME, "operation.lock");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run(exe, args, env = process.env, expect = 0) {
    const result = spawnSync(exe, args, { cwd: ROOT, env, encoding: "utf8", windowsHide: true });
    if (result.status !== expect) {
        throw new Error(`command exit ${result.status}, expected ${expect}: ${exe} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    }
    return `${result.stdout || ""}${result.stderr || ""}`;
}

function tempUserscript(name) {
    const file = path.join(os.tmpdir(), `bpw-${process.pid}-${name.replace(/\W+/g, "-")}.user.js`);
    fs.writeFileSync(file, `// ==UserScript==\n// @name        ${name}\n// @namespace   bpw.test\n// @version     1.0.0\n// @match       https://example.com/*\n// @grant       GM_xmlhttpRequest\n// ==/UserScript==\nconsole.log(${JSON.stringify(name)});\n`, "utf8");
    return file;
}

function randomPort() {
    return 18000 + Math.floor(Math.random() * 1000);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function getStatusFreshConnection(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { agent: false, timeout: 2000 }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        });
        req.on("timeout", () => req.destroy(new Error(`request timed out: ${url}`)));
        req.on("error", reject);
    });
}

function testPowerShellUtf8Bridge() {
    if (process.platform !== "win32") return;

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `bpw-utf8-${process.pid}-`));
    const skillRoot = path.join(tempRoot, "cent-cdp-browser");
    const scriptsDir = path.join(skillRoot, "scripts");
    const previousBrowserState = fs.existsSync(BROWSER_STATE) ? fs.readFileSync(BROWSER_STATE) : null;

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "start_cent_cdp.py"), [
        "import json",
        "print(json.dumps({",
        "    'ok': True,",
        "    'action': 'reuse',",
        "    'cdp_port': 9222,",
        "    'browser': '浏览器.exe',",
        "    'user_data': '用户数据',",
        "    'profile': '默认',",
        "    'pages': [{'title': '暴力猴'}]",
        "}, ensure_ascii=False))"
    ].join("\n"), "utf8");
    const env = {
        ...process.env,
        CENT_CDP_SKILL: skillRoot,
        PYTHONUTF8: "1"
    };
    delete env.PYTHONIOENCODING;

    try {
        const output = run("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", path.join(ROOT, "tools", "start-browser.ps1"),
            "-Url", "https://example.com/",
            "-Port", "9222",
            "-Session", "bpw-utf8-test"
        ], env);
        assert(output.includes("CDP READY: 9222"), "PowerShell/Python UTF-8 bridge failed on non-ASCII JSON");
        const browserState = JSON.parse(fs.readFileSync(BROWSER_STATE, "utf8").replace(/^\uFEFF/, ""));
        assert(browserState.browser === "浏览器.exe", "PowerShell/Python UTF-8 bridge lost non-ASCII browser data");
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        if (previousBrowserState) fs.writeFileSync(BROWSER_STATE, previousBrowserState);
        else fs.rmSync(BROWSER_STATE, { force: true });
    }
}

async function main() {
    const help = run(process.execPath, [BPW, "--help"]);
    assert(help.includes("bpw doctor"), "CLI help missing doctor");
    assert(help.includes("--request <json>"), "CLI help missing request-file start path");
    assert(!help.includes("bpw inspect"), "lean CLI unexpectedly exposes inspect");

    const doctor = run(process.execPath, [BPW, "doctor", "--json"]);
    const doctorJson = JSON.parse(doctor);
    assert(["READY", "READY_WITH_WARNING"].includes(doctorJson.status), "doctor should accept bundled example");

    const requestFile = path.join(os.tmpdir(), `bpw-request-${process.pid}.json`);
    const requestSource = path.join(os.tmpdir(), `bpw-request-missing-${process.pid}.user.js`);
    fs.writeFileSync(requestFile, JSON.stringify({ source: requestSource, url: "https://example.com/" }), "utf8");
    try {
        const requestOutput = run(process.execPath, [BPW, "start", "--request", requestFile], process.env, 1);
        assert(requestOutput.includes(`userscript source not found: ${requestSource}`), "request-file source/url were not applied before start");
    } finally {
        fs.rmSync(requestFile, { force: true });
    }

    fs.writeFileSync(requestFile, JSON.stringify({ source: requestSource, url: "https://example.com/", manager: "tampermonkey" }), "utf8");
    try {
        const requestOutput = run(process.execPath, [BPW, "start", "--request", requestFile], process.env, 1);
        assert(requestOutput.includes(`userscript source not found: ${requestSource}`), "request-file manager support changed start preflight ordering");
    } finally {
        fs.rmSync(requestFile, { force: true });
    }

    testPowerShellUtf8Bridge();

    fs.mkdirSync(RUNTIME, { recursive: true });
    assert(!fs.existsSync(OPERATION_LOCK), "test requires no active BPW operation");
    const liveOwner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    await wait(150);
    fs.writeFileSync(OPERATION_LOCK, JSON.stringify({
        pid: liveOwner.pid,
        operation: "start",
        startedAt: new Date().toISOString(),
        token: "live-lock-test"
    }), { flag: "wx" });
    try {
        const blocked = run(process.execPath, [BPW, "stop"], process.env, 1);
        assert(blocked.includes("another BPW operation"), "concurrent lifecycle operation was not rejected");
        assert(blocked.includes(`pid ${liveOwner.pid}`), "lock rejection did not identify the live owner");
    } finally {
        liveOwner.kill();
        fs.rmSync(OPERATION_LOCK, { force: true });
    }

    const deadOwner = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore", windowsHide: true });
    await new Promise((resolve) => deadOwner.once("exit", resolve));
    fs.writeFileSync(OPERATION_LOCK, JSON.stringify({
        pid: deadOwner.pid,
        operation: "start",
        startedAt: new Date().toISOString(),
        token: "stale-lock-test"
    }), { flag: "wx" });
    const recovered = run(process.execPath, [BPW, "stop"]);
    assert(recovered.includes("status: STOPPED"), "stale lifecycle lock was not reclaimed automatically");
    assert(!fs.existsSync(OPERATION_LOCK), "stale lifecycle lock remained after recovery");

    const override = tempUserscript("Override Source");
    const overrideEnv = { ...process.env, BPW_SOURCE: override };
    run(process.execPath, [LOADER], overrideEnv);
    const generated = fs.readFileSync(path.join(RUNTIME, "WorkbenchDev.user.js"), "utf8");
    assert(generated.includes("Override Source [Workbench Dev]"), "BPW_SOURCE override did not reach loader generator");
    assert(generated.includes("onerror() {}"), "idle loader should fail quietly when BPW is stopped");

    const sourceA = tempUserscript("Server A");
    const sourceB = tempUserscript("Server B");
    const port = randomPort();
    const envA = { ...process.env, BPW_SOURCE: sourceA, BPW_DEV_PORT: String(port) };
    const envB = { ...process.env, BPW_SOURCE: sourceB, BPW_DEV_PORT: String(port) };
    run(process.execPath, [CONTROL, "start"], envA);
    try {
        const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
        assert(health.app === "browser-plugin-workbench", "health missing BPW identity");
        assert(path.normalize(health.source) === path.normalize(sourceA), "health source mismatch");

        const mismatch = run(process.execPath, [CONTROL, "start"], envB, 1);
        assert(mismatch.includes("different service or BPW source"), "source mismatch did not fail safely");

        const stillAlive = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
        assert(Number(stillAlive.pid) === Number(health.pid), "mismatch start disturbed the existing server");

        const token = sourceIdentity(sourceA).token;
        const unavailable = `${sourceA}.temporarily-missing`;
        fs.renameSync(sourceA, unavailable);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/userscript?identity=${token}`);
            assert(response.status === 503, "temporary source disappearance should return 503");
            const after = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
            assert(after.pid === health.pid, "temporary source disappearance killed dev server");
        } finally {
            fs.renameSync(unavailable, sourceA);
        }
    } finally {
        run(process.execPath, [CONTROL, "stop"], envA);
    }

    run(process.execPath, [CONTROL, "start"], envB);
    try {
        const oldToken = sourceIdentity(sourceA).token;
        const status = await getStatusFreshConnection(`http://127.0.0.1:${port}/userscript?identity=${oldToken}`);
        assert(status === 409, "old loader accepted a different source on the same port");
    } finally {
        run(process.execPath, [CONTROL, "stop"], envB);
    }

    const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    await wait(150);
    const stalePort = randomPort();
    fs.mkdirSync(RUNTIME, { recursive: true });
    fs.writeFileSync(SERVER_STATE, JSON.stringify({
        app: "browser-plugin-workbench",
        pid: sleeper.pid,
        host: "127.0.0.1",
        port: stalePort,
        source: sourceA
    }), "utf8");
    const staleEnv = { ...process.env, BPW_SOURCE: sourceA, BPW_DEV_PORT: String(stalePort) };
    run(process.execPath, [CONTROL, "stop"], staleEnv);
    assert(sleeper.exitCode === null, "stale PID caused an unrelated process to be killed");
    sleeper.kill();

    for (const file of [override, sourceA, sourceB]) fs.rmSync(file, { force: true });
    fs.rmSync(SERVER_STATE, { force: true });
    console.log("[workbench] CLI TEST PASS");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
