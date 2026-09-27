const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "workbench.config.json"), "utf8"));
const BASE = `http://${CONFIG.devServer.host}:${CONFIG.devServer.port}`;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
    let lastError;
    for (let i = 0; i < 30; i += 1) {
        try {
            const response = await fetch(`${BASE}/healthz`, { cache: "no-store" });
            if (response.ok) return response.json();
        } catch (error) {
            lastError = error;
        }
        await sleep(100);
    }
    throw lastError || new Error("dev server did not become ready");
}

async function main() {
    const child = spawn(process.execPath, [path.join(ROOT, "tools", "dev-server.js")], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"]
    });

    try {
        const health = await waitForServer();
        if (!health.ok) throw new Error("healthz returned ok=false");

        const scriptResponse = await fetch(`${BASE}/userscript?t=${Date.now()}`, { cache: "no-store" });
        if (scriptResponse.status !== 200) throw new Error(`/userscript HTTP ${scriptResponse.status}`);
        const source = await scriptResponse.text();
        if (!source.includes("Browser Plugin Workbench Example")) throw new Error("served userscript is not the bundled example source");
        if (source.length < 200) throw new Error("served example source is unexpectedly small");

        const loaderResponse = await fetch(`${BASE}/WorkbenchDev.user.js`, { cache: "no-store" });
        if (loaderResponse.status !== 200) throw new Error(`/WorkbenchDev.user.js HTTP ${loaderResponse.status}`);
        const loader = await loaderResponse.text();
        if (!loader.includes("Browser Plugin Workbench Example [Workbench Dev]")) throw new Error("served dev loader is not the generated example loader");

        const extensionResponse = await fetch(`${BASE}/extension`, { cache: "no-store" });
        if (extensionResponse.status !== 501) throw new Error(`reserved extension route expected 501, got ${extensionResponse.status}`);

        console.log("[workbench] SMOKE PASS");
    } finally {
        child.kill();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
