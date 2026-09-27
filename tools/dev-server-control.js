const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ROOT, loadConfig, resolveSourcePath } = require("./config");

const APP_ID = "browser-plugin-workbench";
const config = loadConfig();
const host = config.devServer?.host || "127.0.0.1";
const port = Number(config.devServer?.port || 8890);
const source = resolveSourcePath(config);
const runtime = path.join(ROOT, "runtime");
const stateFile = path.join(runtime, "dev-server.json");
const healthUrl = `http://${host}:${port}/healthz`;

fs.mkdirSync(runtime, { recursive: true });

function health(url = healthUrl) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: 800 }, (res) => {
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

function sameServer(value, expectedSource = source) {
    return Boolean(value && value.ok === true && value.app === APP_ID && Number.isInteger(Number(value.pid)) && path.normalize(value.source || "") === path.normalize(expectedSource));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function writeState(pid) {
    fs.writeFileSync(stateFile, JSON.stringify({
        app: APP_ID,
        pid,
        host,
        port,
        source,
        startedAt: new Date().toISOString()
    }, null, 2), "utf8");
}

async function start() {
    const current = await health();
    if (current) {
        if (!sameServer(current)) {
            throw new Error(`port ${port} is already in use by a different service or BPW source`);
        }
        writeState(Number(current.pid));
        console.log(`[workbench] reusing dev server: ${healthUrl}`);
        console.log(JSON.stringify(current));
        return current;
    }

    const child = spawn(process.execPath, [path.join(ROOT, "tools", "dev-server.js")], {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        env: process.env
    });
    child.unref();

    for (let i = 0; i < 40; i += 1) {
        await sleep(200);
        const value = await health();
        if (value) {
            if (!sameServer(value) || Number(value.pid) !== child.pid) {
                throw new Error(`port ${port} became occupied by an unexpected service`);
            }
            writeState(child.pid);
            console.log(`[workbench] DEV SERVER READY: ${healthUrl}`);
            console.log(`[workbench] PID: ${child.pid}`);
            console.log(JSON.stringify(value));
            return value;
        }
    }
    throw new Error(`dev server PID ${child.pid} did not become ready`);
}

async function status() {
    const value = await health();
    if (!sameServer(value)) {
        console.error(`[workbench] DEV SERVER STOPPED OR MISMATCHED: ${healthUrl}`);
        process.exitCode = 1;
        return null;
    }
    console.log(`[workbench] DEV SERVER PASS: ${healthUrl}`);
    console.log(JSON.stringify(value));
    return value;
}

function readOwnedState() {
    if (!fs.existsSync(stateFile)) return null;
    try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); }
    catch { return null; }
}

async function stop() {
    const owned = readOwnedState();
    if (!owned) {
        fs.rmSync(stateFile, { force: true });
        console.log("[workbench] no owned dev server state");
        return;
    }

    const ownedUrl = `http://${owned.host || host}:${Number(owned.port || port)}/healthz`;
    const current = await health(ownedUrl);
    const identityMatches = current
        && current.app === APP_ID
        && Number(current.pid) === Number(owned.pid)
        && path.normalize(current.source || "") === path.normalize(owned.source || "");

    if (!identityMatches) {
        fs.rmSync(stateFile, { force: true });
        console.log("[workbench] stale/mismatched dev server state removed; no process was killed");
        return;
    }

    try {
        process.kill(Number(owned.pid));
        console.log(`[workbench] stopped owned dev server PID ${owned.pid}`);
    } catch (error) {
        if (error.code !== "ESRCH") throw error;
    } finally {
        fs.rmSync(stateFile, { force: true });
    }
}

async function main() {
    const action = (process.argv[2] || "start").toLowerCase();
    if (action === "start") await start();
    else if (action === "status") await status();
    else if (action === "stop") await stop();
    else throw new Error(`unknown action: ${action}`);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
