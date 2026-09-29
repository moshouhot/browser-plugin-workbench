const crypto = require("node:crypto");
const http = require("node:http");
const { metadataIdentity } = require("./source-identity");

const TAMPERMONKEY_IDS = [
    "dhdgffkkebhmkfjojejmpbldmpobfkfo",
    "gcalenpjmijncebpfijmoaglllgpjagf"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function cdpCall(wsUrl, method, params = {}, timeout = 8000) {
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

async function cdpEvaluate(wsUrl, expression, timeout = 8000) {
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

async function inspectExtensionPage(port, extensionId, page = "options.html") {
    const target = await createTarget(port, `chrome-extension://${extensionId}/${page}`);
    try {
        return await waitForExtensionRuntime(target.webSocketDebuggerUrl, extensionId);
    } finally {
        await closeTarget(port, target.id);
    }
}

async function findTampermonkeyExtension(port) {
    for (const extensionId of TAMPERMONKEY_IDS) {
        try {
            const info = await inspectExtensionPage(port, extensionId);
            if (info) return { extensionId, version: info.version, name: info.name };
        } catch {}
    }
    throw new Error("Tampermonkey extension was not found in the current CDP profile");
}

async function withTampermonkeyPage(port, extensionId, operation) {
    const target = await createTarget(port, `chrome-extension://${extensionId}/options.html`);
    try {
        const verified = await waitForExtensionRuntime(target.webSocketDebuggerUrl, extensionId);
        if (!verified) throw new Error("Tampermonkey extension page could not be verified");
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

function assertRuntimeMessage(result, label) {
    if (result?.lastError) throw new Error(`${label} failed: ${result.lastError}`);
    if (result?.response?.error) {
        const error = result.response.error;
        throw new Error(`${label} failed: ${typeof error === "string" ? error : JSON.stringify(error)}`);
    }
    return result?.response || {};
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
            enabled: Boolean(value.enabled),
            deleted: Boolean(value.deleted)
        });
    }
    Object.values(value).forEach((item) => flattenScriptItems(item, out));
    return out;
}

async function loadFastTree(wsUrl, referrer, extra = {}) {
    const result = await cdpEvaluate(wsUrl, runtimeMessageExpression({
        method: "loadTree",
        referrer,
        complete: true,
        ...extra
    }));
    const response = assertRuntimeMessage(result, `Tampermonkey loadTree ${referrer}`);
    if (!Object.hasOwn(response, "items")) throw new Error(`Tampermonkey loadTree ${referrer} returned no items`);
    return response.items;
}

function exactMatches(items, identity) {
    return items.filter((item) => item.name === identity.name && item.namespace === identity.namespace);
}

async function fastReadSourceOnPage(wsUrl, uuid) {
    const items = await loadFastTree(wsUrl, "options.scripts.userscripts.source", { uuid });
    const source = Array.isArray(items) ? items[0] : undefined;
    if (typeof source !== "string") throw new Error(`Tampermonkey source read failed for ${uuid}`);
    return source;
}

async function fastReadSource(port, extensionId, uuid) {
    return withTampermonkeyPage(port, extensionId, (wsUrl) => fastReadSourceOnPage(wsUrl, uuid));
}

async function fastSnapshot(port, extensionId, identity, loaderIdentity) {
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        const items = flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts"));
        const formalMatches = exactMatches(items, identity);
        const loaderMatches = exactMatches(items, loaderIdentity);
        if (formalMatches.length > 1) throw new Error("multiple Tampermonkey formal scripts match the requested identity");
        if (loaderMatches.length > 1) throw new Error("multiple Tampermonkey dev loaders match the requested identity");
        const formal = formalMatches[0] || null;
        const loader = loaderMatches[0] || null;
        if (formal) formal.code = await fastReadSourceOnPage(wsUrl, formal.uuid);
        if (loader) loader.code = await fastReadSourceOnPage(wsUrl, loader.uuid);
        return { formal, loader, scripts: items };
    });
}

async function setEnabledStates(port, extensionId, changes) {
    if (!changes.length) return;
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        for (const change of changes) {
            assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
                method: "modifyScriptOptions",
                uuid: change.uuid,
                enabled: Boolean(change.enabled),
                reload: false
            })), "Tampermonkey modifyScriptOptions");
        }
    });
}

async function fastCreateScript(port, extensionId, code, identity, label = "script") {
    const actual = metadataIdentity(code);
    if (actual.name !== identity.name || actual.namespace !== identity.namespace) {
        throw new Error(`Tampermonkey ${label} source identity changed before create`);
    }
    let createdUuid = null;
    try {
        return await withTampermonkeyPage(port, extensionId, async (wsUrl) => {
            const activeBefore = exactMatches(flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts")), identity);
            const trashBefore = exactMatches(flattenScriptItems(await loadFastTree(wsUrl, "options.trash")), identity);
            if (activeBefore.length || trashBefore.length) {
                throw new Error(`Tampermonkey ${label} already exists in active scripts or trash; refusing create`);
            }

            const created = assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
                method: "saveScript",
                uuid: `bpw-${crypto.randomBytes(12).toString("hex")}`,
                name: identity.name,
                code,
                new_script: true,
                reload: false
            })), `Tampermonkey create ${label}`);
            if (created.installed !== true) throw new Error(`Tampermonkey create ${label} did not report installed=true`);
            if (created.uuid) createdUuid = String(created.uuid);

            const activeAfter = exactMatches(flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts")), identity);
            if (activeAfter.length !== 1) throw new Error(`Tampermonkey create ${label} did not produce exactly one active script`);
            const script = activeAfter[0];
            createdUuid = script.uuid;
            if (created.uuid && String(created.uuid) !== script.uuid) {
                throw new Error(`Tampermonkey create ${label} returned a different UUID than loadTree`);
            }
            const saved = await fastReadSourceOnPage(wsUrl, script.uuid);
            if (saved !== code) throw new Error(`Tampermonkey create ${label} source verification failed`);

            assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
                method: "modifyScriptOptions",
                uuid: script.uuid,
                enabled: false,
                reload: false
            })), `Tampermonkey disable newly created ${label}`);
            return { ...script, enabled: false, code: saved };
        });
    } catch (error) {
        if (createdUuid) {
            try { await fastDeleteScript(port, extensionId, createdUuid, identity, `${label} cleanup`); } catch {}
        }
        throw error;
    }
}

async function fastUpdateScript(port, extensionId, uuid, code, identity, label = "script") {
    const actual = metadataIdentity(code);
    if (actual.name !== identity.name || actual.namespace !== identity.namespace) {
        throw new Error(`Tampermonkey ${label} source identity changed before update`);
    }
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        const active = flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts"));
        const byUuid = active.filter((item) => item.uuid === uuid);
        if (byUuid.length !== 1) throw new Error(`Tampermonkey ${label} UUID is missing or ambiguous; refusing update`);
        if (byUuid[0].name !== identity.name || byUuid[0].namespace !== identity.namespace) {
            throw new Error(`Tampermonkey ${label} UUID identity changed; refusing update`);
        }
        assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
            method: "saveScript",
            uuid,
            name: identity.name,
            code,
            reload: false
        })), `Tampermonkey update ${label}`);
        const saved = await fastReadSourceOnPage(wsUrl, uuid);
        if (saved !== code) throw new Error(`Tampermonkey update ${label} source verification failed`);
        return { ...byUuid[0], code: saved };
    });
}

async function fastDeleteScript(port, extensionId, uuid, identity, label = "script") {
    if (!uuid) return { deleted: false };
    return withTampermonkeyPage(port, extensionId, async (wsUrl) => {
        let active = flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts"));
        let trash = flattenScriptItems(await loadFastTree(wsUrl, "options.trash"));
        const byUuid = (items) => items.filter((item) => item.uuid === uuid);
        const matchesIdentity = (item) => item.name === identity.name && item.namespace === identity.namespace;
        const activeByUuid = byUuid(active);
        const trashByUuid = byUuid(trash);
        for (const item of [...activeByUuid, ...trashByUuid]) {
            if (!matchesIdentity(item)) throw new Error(`Tampermonkey ${label} UUID identity changed; refusing delete`);
        }
        if (!activeByUuid.length && !trashByUuid.length) return { deleted: false };
        if (activeByUuid.length > 1 || trashByUuid.length > 1) throw new Error(`Tampermonkey ${label} UUID is ambiguous; refusing delete`);

        if (activeByUuid.length) {
            assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
                method: "saveScript",
                uuid,
                reload: false
            })), `Tampermonkey move ${label} to trash`);
            active = flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts"));
            trash = flattenScriptItems(await loadFastTree(wsUrl, "options.trash"));
            if (byUuid(active).length !== 0) throw new Error(`Tampermonkey ${label} remained active after trash transition`);
            const moved = byUuid(trash);
            if (moved.length !== 1 || !matchesIdentity(moved[0])) throw new Error(`Tampermonkey ${label} trash transition could not be verified`);
        }

        assertRuntimeMessage(await cdpEvaluate(wsUrl, runtimeMessageExpression({
            method: "purgeScripts",
            uuids: [uuid]
        }), 12000), `Tampermonkey purge ${label}`);
        active = flattenScriptItems(await loadFastTree(wsUrl, "options.scripts.userscripts"));
        trash = flattenScriptItems(await loadFastTree(wsUrl, "options.trash"));
        if (byUuid(active).length || byUuid(trash).length) throw new Error(`Tampermonkey ${label} still exists after purge`);
        return { deleted: true };
    });
}

async function prepare(port, sourceCode, loaderCode, identity, loaderIdentity) {
    const extension = await findTampermonkeyExtension(port);
    const before = await fastSnapshot(port, extension.extensionId, identity, loaderIdentity);
    let loaderCreated = false;
    let loaderUpdated = false;

    try {
        if (before.loader) {
            if (before.loader.code !== loaderCode) {
                await fastUpdateScript(port, extension.extensionId, before.loader.uuid, loaderCode, loaderIdentity, "dev loader");
                loaderUpdated = true;
            }
        } else {
            await fastCreateScript(port, extension.extensionId, loaderCode, loaderIdentity, "dev loader");
            loaderCreated = true;
        }

        const after = await fastSnapshot(port, extension.extensionId, identity, loaderIdentity);
        if (!after.loader) throw new Error("Tampermonkey dev loader was not found after Fast API update");
        const changes = [];
        if (after.formal?.enabled) changes.push({ uuid: after.formal.uuid, enabled: false });
        changes.push({ uuid: after.loader.uuid, enabled: true });
        await setEnabledStates(port, extension.extensionId, changes);
        return {
            extensionId: extension.extensionId,
            extensionVersion: extension.version,
            transport: "internal-fast-api",
            stage: "active",
            identity,
            loaderIdentity,
            formal: before.formal && {
                id: before.formal.uuid,
                enabled: before.formal.enabled,
                code: before.formal.code
            },
            loader: {
                id: after.loader.uuid,
                created: loaderCreated
            }
        };
    } catch (error) {
        try {
            const current = await fastSnapshot(port, extension.extensionId, identity, loaderIdentity);
            if (current.loader) {
                await setEnabledStates(port, extension.extensionId, [{ uuid: current.loader.uuid, enabled: false }]);
                if (loaderCreated) await fastDeleteScript(port, extension.extensionId, current.loader.uuid, loaderIdentity, "dev loader");
                else if (loaderUpdated && before.loader) await fastUpdateScript(port, extension.extensionId, current.loader.uuid, before.loader.code, loaderIdentity, "dev loader rollback");
            }
            if (current.formal && before.formal) {
                await setEnabledStates(port, extension.extensionId, [{ uuid: current.formal.uuid, enabled: before.formal.enabled }]);
            }
        } catch {}
        throw error;
    }
}

async function restore(port, state) {
    const current = await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
    if (state.loader?.id && current.loader && current.loader.uuid !== state.loader.id) {
        throw new Error("Tampermonkey dev loader UUID changed; state was not modified");
    }
    if (state.formal) {
        if (!current.formal || current.formal.uuid !== state.formal.id) {
            throw new Error("Tampermonkey formal script UUID changed; state was not modified");
        }
    }
    const changes = [];
    if (current.loader) changes.push({ uuid: current.loader.uuid, enabled: false });
    if (current.formal && state.formal) changes.push({ uuid: current.formal.uuid, enabled: state.formal.enabled });
    await setEnabledStates(port, state.extensionId, changes);
    if (state.loader?.created && current.loader) {
        await fastDeleteScript(port, state.extensionId, current.loader.uuid, state.loaderIdentity, "dev loader");
    }
    return { loaderId: current.loader?.uuid || null };
}

async function finish(port, state, sourceCode, originalCode) {
    const identity = metadataIdentity(sourceCode);
    if (identity.name !== state.identity.name || identity.namespace !== state.identity.namespace) {
        throw new Error("source @name/@namespace changed during development; formal Tampermonkey script was not updated");
    }

    let formalCreated = false;
    let formalUpdated = false;
    let formalId = null;
    try {
        let current = await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
        if (state.formal) {
            if (!current.formal || current.formal.uuid !== state.formal.id) {
                throw new Error("Tampermonkey formal script identity changed; promotion was aborted");
            }
            if (current.formal.code !== sourceCode && current.formal.code !== originalCode) {
                throw new Error("Tampermonkey formal script changed since bpw start; promotion was aborted");
            }
            formalId = current.formal.uuid;
            if (current.formal.code !== sourceCode) {
                await fastUpdateScript(port, state.extensionId, formalId, sourceCode, state.identity, "formal script");
                formalUpdated = true;
            }
        } else {
            if (current.formal) throw new Error("a Tampermonkey formal script appeared during development; promotion was aborted");
            const created = await fastCreateScript(port, state.extensionId, sourceCode, state.identity, "formal script");
            formalCreated = true;
            formalId = created.uuid;
        }

        current = await fastSnapshot(port, state.extensionId, state.identity, state.loaderIdentity);
        if (!current.formal || current.formal.uuid !== formalId) throw new Error("Tampermonkey formal script is unavailable after promotion");
        if (state.loader?.id && current.loader && current.loader.uuid !== state.loader.id) {
            throw new Error("Tampermonkey dev loader UUID changed; state was not modified");
        }
        const changes = [];
        if (current.loader) changes.push({ uuid: current.loader.uuid, enabled: false });
        changes.push({ uuid: current.formal.uuid, enabled: true });
        await setEnabledStates(port, state.extensionId, changes);
        if (state.loader?.created && current.loader) {
            await fastDeleteScript(port, state.extensionId, current.loader.uuid, state.loaderIdentity, "dev loader");
        }
        return { formalId: current.formal.uuid, transport: "internal-fast-api" };
    } catch (error) {
        try {
            if (formalCreated && formalId) {
                await fastDeleteScript(port, state.extensionId, formalId, state.identity, "formal script rollback");
            } else if (formalUpdated && state.formal && originalCode) {
                await fastUpdateScript(port, state.extensionId, state.formal.id, originalCode, state.identity, "formal script rollback");
                await setEnabledStates(port, state.extensionId, [{ uuid: state.formal.id, enabled: state.formal.enabled }]);
            }
        } catch {}
        throw error;
    }
}

module.exports = {
    TAMPERMONKEY_IDS,
    findTampermonkeyExtension,
    fastReadSource,
    fastSnapshot,
    fastCreateScript,
    fastUpdateScript,
    fastDeleteScript,
    prepare,
    restore,
    finish
};
