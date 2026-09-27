const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "workbench.config.json"), "utf8"));
const host = config.devServer?.host || "127.0.0.1";
const port = Number(config.devServer?.port || 8890);
const runtime = path.join(ROOT, "runtime");
const pidFile = path.join(runtime, "dev-server.pid");
const healthUrl = `http://${host}:${port}/healthz`;

fs.mkdirSync(runtime, { recursive: true });

function health() {
    return new Promise((resolve) => {
        const req = http.get(healthUrl, { timeout: 800 }, (res) => {
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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function start() {
    const current = await health();
    if (current) {
        console.log(`[workbench] reusing dev server: ${healthUrl}`);
        console.log(JSON.stringify(current));
        return;
    }
    const child = spawn(process.execPath, [path.join(ROOT, "tools", "dev-server.js")], {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: "ignore"
    });
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid), "ascii");
    for (let i = 0; i < 40; i += 1) {
        await sleep(200);
        const value = await health();
        if (value) {
            console.log(`[workbench] DEV SERVER READY: ${healthUrl}`);
            console.log(`[workbench] PID: ${child.pid}`);
            console.log(JSON.stringify(value));
            return;
        }
    }
    throw new Error(`dev server PID ${child.pid} did not become ready`);
}

async function status() {
    const value = await health();
    if (!value) {
        console.error(`[workbench] DEV SERVER STOPPED: ${healthUrl}`);
        process.exitCode = 1;
        return;
    }
    console.log(`[workbench] DEV SERVER PASS: ${healthUrl}`);
    console.log(JSON.stringify(value));
}

function stop() {
    if (!fs.existsSync(pidFile)) return;
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid); console.log(`[workbench] stopped dev server PID ${pid}`); }
        catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    fs.rmSync(pidFile, { force: true });
}

const action = (process.argv[2] || "start").toLowerCase();
Promise.resolve(action === "start" ? start() : action === "status" ? status() : action === "stop" ? stop() : Promise.reject(new Error(`unknown action: ${action}`)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
