const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer, WebSocket: WsSocket } = require("ws");
const { metadataIdentity } = require("./source-identity");

const TAMPERMONKEY_IDS = [
    "dhdgffkkebhmkfjojejmpbldmpobfkfo",
    "gcalenpjmijncebpfijmoaglllgpjagf"
];
const EDITORS_IDS = [
    "afknhifbpphifnhohilgdbjclplncbij",
    "lieodnapokbjkkdkhdljlllmgkmdokcm"
];
const EDITORS_STABLE_ID = "lieodnapokbjkkdkhdljlllmgkmdokcm";
const EDITORS_BUNDLED_VERSION = "1.0.7";
const EDITORS_BUNDLED_COMMIT = "cabbb288f5d7b7734c4ff88a4cefef97d301c633";
const REQUIRED_EXTERNAL_ACTIONS = ["list", "get", "patch", "put", "delete"];
const BUNDLED_EDITORS_ROOT = path.join(__dirname, "..", "vendor", "tampermonkey-editors");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extensionIdFromPublicKey(publicKey) {
    const hex = crypto.createHash("sha256").update(publicKey).digest("hex").slice(0, 32);
    return [...hex].map((character) => String.fromCharCode(97 + Number.parseInt(character, 16))).join("");
}

function validateBundledEditors(directory = BUNDLED_EDITORS_ROOT) {
    const manifestPath = path.join(directory, "manifest.json");
    const metadataPath = path.join(directory, "BPW_VENDOR.json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(metadataPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        const publicKey = Buffer.from(String(manifest.key || ""), "base64");
        if (extensionIdFromPublicKey(publicKey) !== EDITORS_STABLE_ID) return null;
        if (metadata.extensionId !== EDITORS_STABLE_ID) return null;
        if (metadata.version !== EDITORS_BUNDLED_VERSION || manifest.version !== EDITORS_BUNDLED_VERSION) return null;
        if (metadata.upstreamCommit !== EDITORS_BUNDLED_COMMIT) return null;
        if (manifest.name !== "Tampermonkey Editors") return null;
        if (Number(manifest.manifest_version) !== 3) return null;
        if (manifest.update_url) return null;
        for (const required of ["background.js", "popup.html", "popup.js", "LICENSE", "3rdpartylicenses.txt"]) {
            if (!fs.existsSync(path.join(directory, required))) return null;
        }
        return {
            extensionId: EDITORS_STABLE_ID,
            version: manifest.version,
            path: directory,
            source: "bundled",
            upstreamCommit: EDITORS_BUNDLED_COMMIT
        };
    } catch {
        return null;
    }
}

async function prepareManagedEditors() {
    const ready = validateBundledEditors();
    if (!ready) {
        throw new Error(`bundled Tampermonkey Editors ${EDITORS_BUNDLED_VERSION} is missing or failed validation`);
    }
    return ready;
}

function requestJson(url, method = "GET") {
    return new Promise((resolve, reject) => {
        const request = http.request(url, { method, timeout: 3000 }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        });
        request.on("timeout", () => request.destroy(new Error(`CDP request timed out: ${url}`)));
        request.on("error", reject);
        request.end();
    });
}

const getJson = (url) => requestJson(url, "GET");

async function createTarget(port, url) {
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, "PUT");
    if (!target?.id || !target?.webSocketDebuggerUrl) throw new Error("CDP did not return an extension target");
    return target;
}

async function closeTarget(port, targetId) {
    if (!targetId) return;
    try { await getJson(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch {}
}

function cdpCall(wsUrl, method, params = {}, timeout = 6000) {
    if (typeof WebSocket !== "function") throw new Error("Node WebSocket support is unavailable");
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { socket.close(); } catch {}
            if (error) reject(error);
            else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error("Tampermonkey CDP request timed out")), timeout);
        socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
        socket.addEventListener("message", (event) => {
            let message;
            try { message = JSON.parse(String(event.data)); }
            catch (error) { finish(error); return; }
            if (message.id !== 1) return;
            if (message.error) return finish(new Error(message.error.message || "Tampermonkey CDP request failed"));
            const details = message.result?.exceptionDetails;
            if (details) return finish(new Error(details.exception?.description || details.text || "Tampermonkey CDP evaluation failed"));
            finish(null, message.result);
        });
        socket.addEventListener("error", () => finish(new Error("Tampermonkey CDP WebSocket failed")));
    });
}

async function cdpEvaluate(wsUrl, expression, timeout = 6000) {
    const result = await cdpCall(wsUrl, "Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
    }, timeout);
    return result?.result?.value;
}

async function waitForExtensionRuntime(wsUrl, extensionId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const info = await cdpEvaluate(wsUrl, `(()=>{
            const runtime=globalThis.chrome?.runtime;
            if(!runtime?.id||!runtime?.getManifest)return null;
            const manifest=runtime.getManifest();
            return {id:runtime.id,name:manifest.name||'',version:manifest.version||''};
        })()`).catch(() => null);
        if (info?.id === extensionId) return info;
        await sleep(100);
    }
    return null;
}

async function inspectExtensionPage(port, extensionId, page) {
    const target = await createTarget(port, `chrome-extension://${extensionId}/${page}`);
    try {
        const info = await waitForExtensionRuntime(target.webSocketDebuggerUrl, extensionId);
        return info ? { ...info, target } : null;
    } finally {
        await closeTarget(port, target.id);
    }
}

async function findTampermonkeyExtension(port) {
    for (const extensionId of TAMPERMONKEY_IDS) {
        try {
            const info = await inspectExtensionPage(port, extensionId, "options.html");
            if (info) return { extensionId, version: info.version, name: info.name };
        } catch {}
    }
    throw new Error("Tampermonkey extension was not found in the current CDP profile");
}

async function findEditorsExtension(port) {
    for (const extensionId of EDITORS_IDS) {
        try {
            const info = await inspectExtensionPage(port, extensionId, "popup.html");
            if (info) return { extensionId, version: info.version, name: info.name };
        } catch {}
    }
    throw new Error("Tampermonkey Editors is required for the External userscripts API but is not installed in the current CDP profile");
}

function flattenScriptItems(value, out = []) {
    if (!value) return out;
    if (Array.isArray(value)) {
        value.forEach((item) => flattenScriptItems(item, out));
        return out;
    }
    if (typeof value !== "object") return out;
    if (value.uuid && value.name && Object.hasOwn(value, "enabled")) {
        out.push({
            uuid: String(value.uuid),
            name: String(value.name),
            namespace: String(value.namespace || ""),
            enabled: Boolean(value.enabled)
        });
    }
    Object.values(value).forEach((item) => flattenScriptItems(item, out));
    return out;
}

async function withTampermonkeyPage(port, extensionId, operation) {
    const target = await createTarget(port, `chrome-extension://${extensionId}/options.html`);
    try {
        const verified = await waitForExtensionRuntime(target.webSocketDebuggerUrl, extensionId);
        if (verified?.id !== extensionId) {
            throw new Error("Tampermonkey extension page could not be verified");
        }
        return await operation(target.webSocketDebuggerUrl);
    } finally {
        await closeTarget(port, target.id);
    }
}

function runtimeMessageExpression(message) {
    return `new Promise((resolve)=>{
        chrome.runtime.sendMessage(${JSON.stringify(message)},(response)=>resolve({
            response,
            lastError:chrome.runtime.lastError?chrome.runtime.lastError.message:null
        }));
    })`;
}

async function fastSnapshot(port, extensionId, identity, loaderIdentity) {
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        const noop = await cdpEvaluate(wsUrl, runtimeMessageExpression({ method: "modifyScriptOptions" }));
        if (noop?.lastError) throw new Error(`Tampermonkey modifyScriptOptions probe failed: ${noop.lastError}`);
        const tree = await cdpEvaluate(wsUrl, runtimeMessageExpression({
            method: "loadTree",
            referrer: "options.scripts.userscripts",
            complete: true
        }));
        if (tree?.lastError || !tree?.response?.items) {
            throw new Error(`Tampermonkey loadTree probe failed${tree?.lastError ? `: ${tree.lastError}` : ""}`);
        }
        const scripts = flattenScriptItems(tree.response.items);
        const match = (wanted) => scripts.filter((item) => item.name === wanted.name && item.namespace === wanted.namespace);
        const formal = match(identity);
        const loader = match(loaderIdentity);
        if (formal.length > 1) throw new Error("multiple Tampermonkey formal scripts match the requested identity");
        if (loader.length > 1) throw new Error("multiple Tampermonkey dev loaders match the requested identity");
        return { formal: formal[0] || null, loader: loader[0] || null, scripts };
    });
}

async function setEnabledStates(port, extensionId, changes) {
    if (!changes.length) return;
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        for (const change of changes) {
            const result = await cdpEvaluate(wsUrl, runtimeMessageExpression({
                method: "modifyScriptOptions",
                uuid: change.uuid,
                enabled: Boolean(change.enabled),
                reload: false
            }));
            if (result?.lastError) throw new Error(`Tampermonkey modifyScriptOptions failed: ${result.lastError}`);
        }
    });
}

class ExternalBridge {
    constructor() {
        this.auth = randomToken();
        this.echo = randomToken();
        this.ws = null;
        this.pending = new Map();
        this.nextId = 1;
        this.connected = new Promise((resolve, reject) => {
            this.resolveConnected = resolve;
            this.rejectConnected = reject;
        });
        this.server = new WebSocketServer({ host: "localhost", port: 0 });
        this.listening = new Promise((resolve, reject) => {
            this.server.once("listening", resolve);
            this.server.once("error", reject);
        });
        this.server.on("connection", (socket) => this.handleConnection(socket));
    }

    async port() {
        await this.listening;
        const address = this.server.address();
        if (!address || typeof address !== "object") throw new Error("Tampermonkey External API bridge did not bind a local port");
        return address.port;
    }

    handleConnection(socket) {
        const receiveOnce = () => new Promise((resolve, reject) => {
            socket.once("message", (value) => resolve(String(value)));
            socket.once("close", () => reject(new Error("Tampermonkey Editors WebSocket closed during authentication")));
        });
        (async () => {
            const first = JSON.parse(await receiveOnce());
            if (first?.method !== "auth" || first?.token !== this.auth) throw new Error("Tampermonkey Editors authentication failed");
            socket.send(JSON.stringify({ method: "auth", token: this.echo }));
            const second = JSON.parse(await receiveOnce());
            if (second?.method !== "authOK") throw new Error("Tampermonkey Editors did not confirm authentication");
            if (this.ws && this.ws !== socket) this.ws.close(4009, "Connection superseded");
            this.ws = socket;
            socket.on("message", (value) => this.handleMessage(String(value)));
            socket.on("close", () => { if (this.ws === socket) this.ws = null; });
            this.resolveConnected();
        })().catch((error) => {
            try { socket.close(3003, "Auth failed"); } catch {}
            this.rejectConnected(error);
        });
    }

    handleMessage(raw) {
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (data?.method === "pong") return;
        const id = String(data?.id ?? data?.messageId ?? "");
        const pending = this.pending.get(id);
        if (!pending || !data?.response) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.resolve(data.response);
    }

    async connectEditors(port, editorsExtensionId) {
        const localPort = await this.port();
        const target = await createTarget(port, `chrome-extension://${editorsExtensionId}/popup.html`);
        try {
            const verified = await waitForExtensionRuntime(target.webSocketDebuggerUrl, editorsExtensionId);
            if (!verified) throw new Error("Tampermonkey Editors extension page could not be verified");
            const result = await cdpEvaluate(target.webSocketDebuggerUrl, runtimeMessageExpression({
                method: "connectWebSocket",
                args: { authorization: `${this.auth}${this.echo}`, port: localPort }
            }), 8000);
            if (result?.lastError) throw new Error(result.lastError);
            if (!result?.response?.ok) throw new Error(result?.response?.error || "Tampermonkey Editors did not connect");
            await Promise.race([
                this.connected,
                new Promise((_, reject) => setTimeout(() => reject(new Error("Tampermonkey Editors connection timed out")), 8000))
            ]);
        } finally {
            await closeTarget(port, target.id);
        }
    }

    command(payload, timeout = 10000) {
        if (!this.ws || this.ws.readyState !== WsSocket.OPEN) return Promise.reject(new Error("Tampermonkey Editors External API is not connected"));
        const messageId = String(this.nextId++);
        const message = { ...payload, messageId };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(messageId);
                reject(new Error(`Tampermonkey External API ${payload.action} timed out`));
            }, timeout);
            this.pending.set(messageId, { resolve, reject, timer });
            this.ws.send(JSON.stringify(message));
        });
    }

    options() { return this.command({ action: "options", activeUrls: [] }); }
    list() { return this.command({ action: "list" }); }
    get(path, ifNotModifiedSince) { return this.command({ action: "get", path, ifNotModifiedSince }); }
    patch(path, value, lastModified) { return this.command({ action: "patch", path, value, lastModified }); }
    put(value, lastModified) { return this.command({ action: "put", value, lastModified }); }
    delete(path) { return this.command({ action: "delete", path }); }

    async dispose() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Tampermonkey External API bridge closed"));
        }
        this.pending.clear();
        if (this.ws) {
            try { this.ws.terminate(); } catch {}
            this.ws = null;
        }
        await new Promise((resolve) => this.server.close(() => resolve()));
    }
}

function randomToken() {
    return crypto.randomBytes(24).toString("hex");
}

function missingExternalCapabilities(allow) {
    const supported = new Set(Array.isArray(allow) ? allow : []);
    return REQUIRED_EXTERNAL_ACTIONS.filter((action) => !supported.has(action));
}

function assertExternalResponse(response, action) {
    if (response?.error) throw new Error(`Tampermonkey External API ${action} failed: ${response.error.number} ${response.error.message}`);
    return response;
}

async function withExternalApi(port, operation) {
    const editors = await findEditorsExtension(port);
    const bridge = new ExternalBridge();
    try {
        await bridge.connectEditors(port, editors.extensionId);
        const options = assertExternalResponse(await bridge.options(), "options");
        const missing = missingExternalCapabilities(options.allow);
        if (missing.length) {
            throw new Error(`Tampermonkey External userscripts API is missing required actions: ${missing.join(", ")}. Tampermonkey 5.6+ and a compatible Tampermonkey Editors build are required`);
        }
        return await operation(bridge, { editorsExtensionId: editors.extensionId, allow: options.allow });
    } finally {
        await bridge.dispose();
    }
}

function matchExternal(list, identity, label) {
    const matches = (list || []).filter((item) => String(item.name || "") === identity.name
        && String(item.namespace || "") === identity.namespace);
    if (matches.length > 1) throw new Error(`multiple Tampermonkey ${label} scripts match the requested identity`);
    return matches[0] || null;
}

function pathUuid(path) {
    if (!path) return null;
    try { return decodeURIComponent(String(path).split("/")[0]); } catch { return String(path).split("/")[0]; }
}

function verifyExternalCode(code, identity, label) {
    const actual = metadataIdentity(code);
    if (actual.name !== identity.name || actual.namespace !== identity.namespace) {
        throw new Error(`Tampermonkey ${label} source identity does not match External API metadata`);
    }
}

async function externalSnapshot(api, identity, loaderIdentity) {
    const listed = assertExternalResponse(await api.list(), "list").list || [];
    const formalEntry = matchExternal(listed, identity, "formal");
    const loaderEntry = matchExternal(listed, loaderIdentity, "dev loader");
    const formal = formalEntry ? await readExternalEntry(api, formalEntry, identity, "formal") : null;
    const loader = loaderEntry ? await readExternalEntry(api, loaderEntry, loaderIdentity, "dev loader") : null;
    return { formal, loader };
}

async function readExternalEntry(api, entry, identity, label) {
    const response = assertExternalResponse(await api.get(entry.path), "get");
    if (typeof response.value !== "string") throw new Error(`Tampermonkey External API returned no ${label} source`);
    verifyExternalCode(response.value, identity, label);
    return { path: entry.path, code: response.value, lastModified: response.lastModified };
}

function crossCheckIdentity(externalEntry, fastEntry, label) {
    if (!externalEntry && !fastEntry) return;
    if (!externalEntry || !fastEntry) throw new Error(`Tampermonkey ${label} differs between External API and internal API`);
    const externalUuid = pathUuid(externalEntry.path);
    if (externalUuid && externalUuid !== fastEntry.uuid) {
        throw new Error(`Tampermonkey ${label} UUID differs between External API and internal API`);
    }
}

async function prepare(port, sourceCode, loaderCode, identity, loaderIdentity) {
    const extension = await findTampermonkeyExtension(port);
    const fastBefore = await fastSnapshot(port, extension.extensionId, identity, loaderIdentity);
    return withExternalApi(port, async (api, externalInfo) => {
        const before = await externalSnapshot(api, identity, loaderIdentity);
        crossCheckIdentity(before.formal, fastBefore.formal, "formal script");
        crossCheckIdentity(before.loader, fastBefore.loader, "dev loader");

        let loaderPath = before.loader?.path || null;
        let loaderCreated = false;
        if (before.loader) {
            if (before.loader.code !== loaderCode) {
                assertExternalResponse(await api.patch(before.loader.path, loaderCode, before.loader.lastModified), "patch");
            }
        } else {
            const created = assertExternalResponse(await api.put(loaderCode), "put");
            loaderPath = created.path || null;
            loaderCreated = true;
        }

        const after = await externalSnapshot(api, identity, loaderIdentity);
        if (!after.loader) throw new Error("Tampermonkey dev loader was not found after External API update");
        loaderPath = after.loader.path;
        const fastAfter = await fastSnapshot(port, extension.extensionId, identity, loaderIdentity);
        crossCheckIdentity(after.formal, fastAfter.formal, "formal script");
        crossCheckIdentity(after.loader, fastAfter.loader, "dev loader");

        try {
            const changes = [{ uuid: fastAfter.loader.uuid, enabled: false }];
            if (fastAfter.formal?.enabled) changes.push({ uuid: fastAfter.formal.uuid, enabled: false });
            changes.push({ uuid: fastAfter.loader.uuid, enabled: true });
            await setEnabledStates(port, extension.extensionId, changes);
        } catch (error) {
            try {
                const rollback = [];
                if (fastAfter.loader) rollback.push({ uuid: fastAfter.loader.uuid, enabled: false });
                if (fastAfter.formal) rollback.push({ uuid: fastAfter.formal.uuid, enabled: fastAfter.formal.enabled });
                await setEnabledStates(port, extension.extensionId, rollback);
            } catch {}
            if (loaderCreated && loaderPath) {
                try { assertExternalResponse(await api.delete(loaderPath), "delete"); } catch {}
            }
            throw error;
        }

        return {
            extensionId: extension.extensionId,
            extensionVersion: extension.version,
            editorsExtensionId: externalInfo.editorsExtensionId,
            externalAllow: externalInfo.allow,
            transport: "external+internal-api",
            stage: "active",
            identity,
            loaderIdentity,
            formal: fastAfter.formal && {
                id: fastAfter.formal.uuid,
                path: after.formal.path,
                enabled: fastAfter.formal.enabled,
                code: after.formal.code
            },
            loader: {
                id: fastAfter.loader.uuid,
                path: after.loader.path,
                created: loaderCreated
            }
        };
    });
}

async function restore(port, state) {
    const current = await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
    if (state.loader?.id && current.loader && current.loader.uuid !== state.loader.id) throw new Error("Tampermonkey dev loader UUID changed; state was not modified");
    if (state.formal) {
        if (!current.formal || current.formal.uuid !== state.formal.id) throw new Error("Tampermonkey formal script UUID changed; state was not modified");
    }
    const changes = [];
    if (current.loader) changes.push({ uuid: current.loader.uuid, enabled: false });
    if (current.formal) changes.push({ uuid: current.formal.uuid, enabled: state.formal.enabled });
    await setEnabledStates(port, state.extensionId, changes);
    if (state.loader?.created && state.loader.path) {
        await withExternalApi(port, async (api) => {
            assertExternalResponse(await api.delete(state.loader.path), "delete");
        });
    }
    return { loaderId: current.loader?.uuid || null };
}

async function finish(port, state, sourceCode, originalCode) {
    const identity = metadataIdentity(sourceCode);
    if (identity.name !== state.identity.name || identity.namespace !== state.identity.namespace) {
        throw new Error("source @name/@namespace changed during development; formal Tampermonkey script was not updated");
    }
    await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
    return withExternalApi(port, async (api) => {
        let snapshot = await externalSnapshot(api, state.identity, state.loaderIdentity);
        let formalPath = snapshot.formal?.path || null;
        if (state.formal) {
            if (!snapshot.formal || pathUuid(snapshot.formal.path) !== state.formal.id) {
                throw new Error("Tampermonkey formal script identity changed; promotion was aborted");
            }
            if (snapshot.formal.code !== sourceCode && snapshot.formal.code !== originalCode) {
                throw new Error("Tampermonkey formal script changed since bpw start; promotion was aborted");
            }
            if (snapshot.formal.code !== sourceCode) {
                assertExternalResponse(await api.patch(snapshot.formal.path, sourceCode, snapshot.formal.lastModified), "patch");
            }
        } else if (snapshot.formal) {
            if (snapshot.formal.code !== sourceCode) throw new Error("a Tampermonkey formal script appeared during development; promotion was aborted");
        } else {
            const created = assertExternalResponse(await api.put(sourceCode), "put");
            formalPath = created.path || null;
        }

        snapshot = await externalSnapshot(api, state.identity, state.loaderIdentity);
        if (!snapshot.formal) throw new Error("Tampermonkey formal script was not found after promotion");
        formalPath = snapshot.formal.path;
        const fast = await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
        crossCheckIdentity(snapshot.formal, fast.formal, "formal script");
        if (!fast.formal) throw new Error("Tampermonkey formal script is unavailable after promotion");
        if (state.loader?.id && fast.loader && fast.loader.uuid !== state.loader.id) throw new Error("Tampermonkey dev loader UUID changed; state was not modified");

        const changes = [];
        if (fast.loader) changes.push({ uuid: fast.loader.uuid, enabled: false });
        changes.push({ uuid: fast.formal.uuid, enabled: true });
        await setEnabledStates(port, state.extensionId, changes);
        if (state.loader?.created && state.loader.path) {
            assertExternalResponse(await api.delete(state.loader.path), "delete");
        }
        return { formalId: fast.formal.uuid, formalPath };
    });
}

module.exports = {
    ExternalBridge,
    EDITORS_STABLE_ID,
    EDITORS_BUNDLED_VERSION,
    EDITORS_BUNDLED_COMMIT,
    REQUIRED_EXTERNAL_ACTIONS,
    TAMPERMONKEY_IDS,
    EDITORS_IDS,
    prepareManagedEditors,
    validateBundledEditors,
    missingExternalCapabilities,
    findTampermonkeyExtension,
    findEditorsExtension,
    fastSnapshot,
    prepare,
    restore,
    finish
};
