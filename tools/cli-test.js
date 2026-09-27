const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BPW = path.join(ROOT, "bin", "bpw.js");
const CONTROL = path.join(ROOT, "tools", "dev-server-control.js");
const LOADER = path.join(ROOT, "tools", "generate-userscript-loader.js");
const RUNTIME = path.join(ROOT, "runtime");
const SERVER_STATE = path.join(RUNTIME, "dev-server.json");
const BROWSER_STATE = path.join(RUNTIME, "browser-session.json");

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

function testPowerShellUtf8Bridge() {
    if (process.platform !== "win32") return;

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `bpw-utf8-${process.pid}-`));
    const skillRoot = path.join(tempRoot, "cent-cdp-browser");
    const scriptsDir = path.join(skillRoot, "scripts");
    const fakeBin = path.join(tempRoot, "bin");
    const previousBrowserState = fs.existsSync(BROWSER_STATE) ? fs.readFileSync(BROWSER_STATE) : null;

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(fakeBin, { recursive: true });
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
    fs.writeFileSync(path.join(fakeBin, "npx.cmd"), "@echo off\r\necho https://example.com/\r\nexit /b 0\r\n", "utf8");

    const env = {
        ...process.env,
        CENT_CDP_SKILL: skillRoot,
        PYTHONUTF8: "1",
        PATH: `${fakeBin};${process.env.PATH || ""}`
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
        assert(output.includes("TARGET TAB READY: https://example.com/"), "PowerShell/Python UTF-8 bridge failed on non-ASCII JSON");
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        if (previousBrowserState) fs.writeFileSync(BROWSER_STATE, previousBrowserState);
        else fs.rmSync(BROWSER_STATE, { force: true });
    }
}

async function main() {
    const help = run(process.execPath, [BPW, "--help"]);
    assert(help.includes("bpw doctor"), "CLI help missing doctor");
    assert(!help.includes("bpw inspect"), "lean CLI unexpectedly exposes inspect");

    const doctor = run(process.execPath, [BPW, "doctor", "--json"]);
    const doctorJson = JSON.parse(doctor);
    assert(["READY", "READY_WITH_WARNING"].includes(doctorJson.status), "doctor should accept bundled example");

    testPowerShellUtf8Bridge();

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
    } finally {
        run(process.execPath, [CONTROL, "stop"], envA);
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
