const http = require("node:http");
const { metadataIdentity } = require("./source-identity");

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

async function finishBackground(port, extensionId, state, sourceCode, originalCode) {
    const identity = metadataIdentity(sourceCode);
    if (identity.name !== state.identity.name || identity.namespace !== state.identity.namespace) {
        throw new Error("source @name/@namespace changed during development; formal script was not updated");
    }
    return backgroundEval(port, extensionId, `
        const call=(cmd,data)=>handleCommandMessage({cmd,data});
        const getData=async()=>((await call('GetData',{}))?.scripts||[]).filter(s=>!s?.config?.removed);
        let scripts=await getData();
        const byIdentity=(identity)=>scripts.filter(s=>s?.meta?.name===identity.name&&s?.meta?.namespace===identity.namespace);
        const loaderMatches=byIdentity(input.loaderIdentity);
        if(loaderMatches.length>1)throw Error('multiple dev loaders match the requested identity');
        let formalId=input.formal?.id||null;
        if(formalId){
            const formal=scripts.find(s=>s?.props?.id===formalId);
            if(!formal||formal.meta?.name!==input.identity.name||formal.meta?.namespace!==input.identity.namespace){
                throw Error('formal script identity changed; promotion was aborted');
            }
            const current=await call('GetScriptCode',formalId);
            if(current!==input.sourceCode&&current!==input.originalCode){
                throw Error('formal script changed since bpw start; promotion was aborted');
            }
        }else{
            const matches=byIdentity(input.identity);
            if(matches.length>1)throw Error('multiple formal scripts match the requested identity');
            if(matches.length===1){
                formalId=matches[0].props.id;
                const current=await call('GetScriptCode',formalId);
                if(current!==input.sourceCode){
                    throw Error('a formal script appeared during development; promotion was aborted');
                }
            }
        }
        if(!formalId||input.formal&&input.sourceCode!==input.originalCode){
            const parsed=await call('ParseScript',{
                id:formalId||undefined,
                code:input.sourceCode,
                config:{enabled:0},
                message:'',
                reloadTab:false
            });
            formalId=parsed?.where?.id;
            if(!formalId)throw Error('Violentmonkey did not return a formal script id');
            if(parsed?.update?.meta?.name!==input.identity.name||parsed?.update?.meta?.namespace!==input.identity.namespace){
                throw Error('Violentmonkey saved an unexpected formal script identity');
            }
        }
        scripts=await getData();
        const formal=scripts.find(s=>s?.props?.id===formalId);
        if(!formal||formal.meta?.name!==input.identity.name||formal.meta?.namespace!==input.identity.namespace){
            throw Error('formal script was not found after promotion');
        }
        const loader=loaderMatches[0]||null;
        if(input.loaderId&&loader&&loader.props.id!==input.loaderId){
            throw Error('dev loader id changed; state was not modified');
        }
        if(loader)await call('UpdateScriptInfo',{id:loader.props.id,config:{enabled:0}});
        await call('UpdateScriptInfo',{id:formalId,config:{enabled:1}});
        return {formalId,loaderId:loader?.props?.id||null};
    `, {
        identity: state.identity,
        loaderIdentity: state.loaderIdentity,
        loaderId: state.loaderId || state.loader?.id || null,
        formal: state.formal && { id: state.formal.id },
        sourceCode,
        originalCode
    });
}

const getJson = (url) => requestJson(url, "GET");

async function createTarget(port, url) {
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, "PUT");
    if (!target?.id || !target?.webSocketDebuggerUrl) {
        throw new Error("CDP did not return a target id and WebSocket URL");
    }
    return target;
}

async function findTargetByUrl(port, url) {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    const matches = targets.filter((item) => item.type === "page"
        && item.url === url
        && item.id
        && item.webSocketDebuggerUrl);
    return matches.length === 1 ? matches[0] : null;
}

async function closeTargetById(port, targetId) {
    if (!targetId) return false;
    try {
        await getJson(`http://127.0.0.1:${port}/json/close/${targetId}`);
        return true;
    } catch {
        return false;
    }
}

async function reloadTargetById(port, targetId) {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    const target = targets.find((item) => item.type === "page"
        && item.id === targetId
        && item.webSocketDebuggerUrl);
    if (!target) throw new Error(`BPW target tab is missing: ${targetId}`);
    await cdpCall(target.webSocketDebuggerUrl, "Page.reload");
}

async function findBackgroundTarget(port, extensionId) {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    return targets.find((item) => item.type === "background_page"
        && item.url?.startsWith(`chrome-extension://${extensionId}/`)
        && item.webSocketDebuggerUrl) || null;
}

function cdpCall(wsUrl, method, params = {}, timeout = 5000) {
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
        const timer = setTimeout(() => finish(new Error("Violentmonkey background CDP request timed out")), timeout);
        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                id: 1,
                method,
                params
            }));
        });
        socket.addEventListener("message", (event) => {
            let message;
            try { message = JSON.parse(String(event.data)); }
            catch (error) { finish(error); return; }
            if (message.id !== 1) return;
            if (message.error) {
                finish(new Error(message.error.message || "Violentmonkey background CDP request failed"));
                return;
            }
            const details = message.result?.exceptionDetails;
            if (details) {
                finish(new Error(details.exception?.description || details.text || "Violentmonkey background evaluation failed"));
                return;
            }
            finish(null, message.result);
        });
        socket.addEventListener("error", () => finish(new Error("Violentmonkey background CDP WebSocket failed")));
    });
}

async function cdpEvaluate(wsUrl, expression, timeout = 5000) {
    const result = await cdpCall(wsUrl, "Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
    }, timeout);
    return result?.result?.value;
}

async function backgroundEval(port, extensionId, body, input) {
    const target = await findBackgroundTarget(port, extensionId);
    if (!target) throw new Error("Violentmonkey background page is unavailable; UI fallback is disabled");
    const expression = `(async(input)=>{${body}})(${JSON.stringify(input)})`;
    return cdpEvaluate(target.webSocketDebuggerUrl, expression);
}

async function hasBackgroundApi(port, extensionId) {
    if (typeof WebSocket !== "function") return false;
    try {
        const target = await findBackgroundTarget(port, extensionId);
        if (!target) return false;
        return Boolean(await cdpEvaluate(target.webSocketDebuggerUrl, `
            (async()=>{
                if(typeof handleCommandMessage!=='function')return false;
                const data=await handleCommandMessage({cmd:'GetData',data:{}});
                return Array.isArray(data?.scripts);
            })()
        `));
    } catch {
        return false;
    }
}

async function inspectBackground(port, extensionId, identity, loaderIdentity) {
    return backgroundEval(port, extensionId, `
        const call=(cmd,data)=>handleCommandMessage({cmd,data});
        const data=await call('GetData',{});
        const scripts=(data?.scripts||[]).filter(s=>!s?.config?.removed);
        const match=(identity)=>scripts.filter(s=>s?.meta?.name===identity.name&&s?.meta?.namespace===identity.namespace);
        const formalMatches=match(input.identity);
        const loaderMatches=match(input.loaderIdentity);
        if(formalMatches.length>1)throw Error('multiple formal scripts match the requested identity');
        if(loaderMatches.length>1)throw Error('multiple dev loaders match the requested identity');
        const formal=formalMatches[0]||null;
        const loader=loaderMatches[0]||null;
        const formalCode=formal?await call('GetScriptCode',formal.props.id):null;
        return {
            formal:formal&&{id:formal.props.id,enabled:!!formal.config.enabled,code:formalCode},
            loader:loader&&{id:loader.props.id,enabled:!!loader.config.enabled}
        };
    `, { identity, loaderIdentity });
}

async function activateBackground(port, extensionId, state, loaderCode) {
    return backgroundEval(port, extensionId, `
        const call=(cmd,data)=>handleCommandMessage({cmd,data});
        const parsed=await call('ParseScript',{
            id:input.loaderId||undefined,
            code:input.loaderCode,
            config:{enabled:0},
            message:'',
            reloadTab:false
        });
        const loaderId=parsed?.where?.id;
        if(!loaderId)throw Error('Violentmonkey did not return a dev loader id');
        const update=parsed?.update;
        if(update?.meta?.name!==input.loaderIdentity.name||update?.meta?.namespace!==input.loaderIdentity.namespace){
            throw Error('Violentmonkey saved an unexpected dev loader identity');
        }
        if(input.formal?.id&&input.formal.enabled){
            await call('UpdateScriptInfo',{id:input.formal.id,config:{enabled:0}});
        }
        await call('UpdateScriptInfo',{id:loaderId,config:{enabled:1}});
        return {loaderId};
    `, {
        formal: state.formal && { id: state.formal.id, enabled: state.formal.enabled },
        loaderId: state.loader?.id || null,
        loaderIdentity: state.loaderIdentity,
        loaderCode
    });
}

async function restoreBackground(port, extensionId, state) {
    return backgroundEval(port, extensionId, `
        const call=(cmd,data)=>handleCommandMessage({cmd,data});
        const data=await call('GetData',{});
        const scripts=(data?.scripts||[]).filter(s=>!s?.config?.removed);
        const byIdentity=(identity)=>scripts.filter(s=>s?.meta?.name===identity.name&&s?.meta?.namespace===identity.namespace);
        const loaderMatches=byIdentity(input.loaderIdentity);
        if(loaderMatches.length>1)throw Error('multiple dev loaders match the requested identity');
        const loader=loaderMatches[0]||null;
        if(input.loaderId&&loader&&loader.props.id!==input.loaderId)throw Error('dev loader id changed; state was not modified');
        if(loader)await call('UpdateScriptInfo',{id:loader.props.id,config:{enabled:0}});
        if(input.formal){
            const formal=scripts.find(s=>s?.props?.id===input.formal.id);
            if(!formal||formal.meta?.name!==input.identity.name||formal.meta?.namespace!==input.identity.namespace){
                throw Error('formal script identity changed; state was not modified');
            }
            await call('UpdateScriptInfo',{id:formal.props.id,config:{enabled:input.formal.enabled?1:0}});
        }
        return {loaderId:loader?.props?.id||null};
    `, {
        identity: state.identity,
        loaderIdentity: state.loaderIdentity,
        loaderId: state.loaderId || state.loader?.id || null,
        formal: state.formal && { id: state.formal.id, enabled: state.formal.enabled }
    });
}

async function findExtensionId(port) {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    const matches = [...new Set(targets.filter((item) => /^(暴力猴|Violentmonkey)$/i.test(item.title || ""))
        .map((item) => /^chrome-extension:\/\/([a-z]{32})\//.exec(item.url || "")?.[1]).filter(Boolean))];
    if (matches.length !== 1) throw new Error(`expected one Violentmonkey extension in CDP profile, found ${matches.length}`);
    return matches[0];
}

module.exports = {
    findExtensionId,
    createTarget,
    findTargetByUrl,
    closeTargetById,
    findBackgroundTarget,
    hasBackgroundApi,
    inspectBackground,
    activateBackground,
    restoreBackground,
    finishBackground,
    reloadTargetById
};
