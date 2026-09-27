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

async function main() {
    const help = run(process.execPath, [BPW, "--help"]);
    assert(help.includes("bpw doctor"), "CLI help missing doctor");
    assert(!help.includes("bpw inspect"), "lean CLI unexpectedly exposes inspect");

    const doctor = run(process.execPath, [BPW, "doctor", "--json"]);
    const doctorJson = JSON.parse(doctor);
    assert(["READY", "READY_WITH_WARNING"].includes(doctorJson.status), "doctor should accept bundled example");

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
