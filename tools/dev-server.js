const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "workbench.config.json"), "utf8"));
const HOST = CONFIG.devServer?.host || "127.0.0.1";
const PORT = Number(CONFIG.devServer?.port || 8890);
const SOURCE_RAW = CONFIG.userscript?.sourcePath || CONFIG.userscript?.entry || "";
const ENTRY = path.isAbsolute(SOURCE_RAW) ? path.normalize(SOURCE_RAW) : path.resolve(ROOT, SOURCE_RAW);
const LOADER = path.join(ROOT, "runtime", "WorkbenchDev.user.js");

if (!SOURCE_RAW || !fs.existsSync(ENTRY)) {
    throw new Error(`userscript source not found: ${ENTRY}`);
}

function commonHeaders(contentType) {
    return {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff"
    };
}

function send(res, status, body, contentType = "text/plain; charset=utf-8", headOnly = false) {
    res.writeHead(status, commonHeaders(contentType));
    res.end(headOnly ? undefined : body);
}

const server = http.createServer((req, res) => {
    const method = req.method || "GET";
    const headOnly = method === "HEAD";
    if (method !== "GET" && !headOnly) {
        send(res, 405, "Method Not Allowed", undefined, headOnly);
        return;
    }

    const host = req.headers.host || "";
    if (!host.startsWith("127.0.0.1:") && !host.startsWith("localhost:")) {
        send(res, 403, "Forbidden", undefined, headOnly);
        return;
    }

    const url = new URL(req.url || "/", `http://${host}`);

    if (url.pathname === "/WorkbenchDev.user.js") {
        try {
            const source = fs.readFileSync(LOADER, "utf8");
            send(res, 200, source, "application/javascript; charset=utf-8", headOnly);
        } catch (error) {
            send(res, 404, "Generate the dev loader first with npm run prepare:userscript", undefined, headOnly);
        }
        return;
    }
    if (url.pathname === "/healthz") {
        send(res, 200, JSON.stringify({ ok: true, source: ENTRY }), "application/json; charset=utf-8", headOnly);
        return;
    }

    if (url.pathname === "/userscript") {
        if (!CONFIG.userscript?.enabled) {
            send(res, 409, "Userscript target is disabled", undefined, headOnly);
            return;
        }
        try {
            const source = fs.readFileSync(ENTRY, "utf8");
            send(res, 200, source, "application/javascript; charset=utf-8", headOnly);
        } catch (error) {
            send(res, 500, String(error), undefined, headOnly);
        }
        return;
    }

    if (url.pathname.startsWith("/extension")) {
        send(res, 501, "Chrome Extension dev flow is reserved for a future version", undefined, headOnly);
        return;
    }

    send(res, 404, "Not Found", undefined, headOnly);
});

server.listen(PORT, HOST, () => {
    console.log(`[workbench] dev server: http://${HOST}:${PORT}`);
    console.log(`[workbench] userscript: http://${HOST}:${PORT}/userscript`);
    console.log(`[workbench] loader install: http://${HOST}:${PORT}/WorkbenchDev.user.js`);
    console.log(`[workbench] health: http://${HOST}:${PORT}/healthz`);
});
