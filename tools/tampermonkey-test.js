const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocket } = require("ws");

const tampermonkey = require("./tampermonkey");

assert.deepEqual(
    tampermonkey.missingExternalCapabilities(["options", "list", "get", "patch"]),
    ["put", "delete"],
    "Tampermonkey 5.5 capability gate must reject missing put/delete"
);
assert.deepEqual(
    tampermonkey.missingExternalCapabilities(["options", "list", "get", "patch", "put", "delete"]),
    [],
    "Tampermonkey 5.6+ capability gate should accept the complete External API"
);
assert(tampermonkey.TAMPERMONKEY_IDS.includes("dhdgffkkebhmkfjojejmpbldmpobfkfo"), "stable Tampermonkey extension id missing");
assert(tampermonkey.EDITORS_IDS.length >= 2, "Tampermonkey Editors ids are incomplete");
assert.equal(tampermonkey.EDITORS_STABLE_ID, "lieodnapokbjkkdkhdljlllmgkmdokcm", "stable Tampermonkey Editors id changed");
assert.equal(tampermonkey.EDITORS_BUNDLED_VERSION, "1.0.7", "bundled Tampermonkey Editors version changed unexpectedly");
assert.equal(tampermonkey.EDITORS_BUNDLED_COMMIT, "cabbb288f5d7b7734c4ff88a4cefef97d301c633", "bundled Tampermonkey Editors commit changed unexpectedly");
const bundled = tampermonkey.validateBundledEditors();
assert(bundled, "bundled Tampermonkey Editors failed validation");
assert.equal(bundled.extensionId, tampermonkey.EDITORS_STABLE_ID, "bundled Tampermonkey Editors id mismatch");
assert.equal(bundled.version, tampermonkey.EDITORS_BUNDLED_VERSION, "bundled Tampermonkey Editors version mismatch");
const bundledManifest = JSON.parse(fs.readFileSync(path.join(bundled.path, "manifest.json"), "utf8"));
assert.equal(bundledManifest.update_url, undefined, "bundled Tampermonkey Editors must stay pinned and must not auto-update");

const source = fs.readFileSync(path.join(__dirname, "tampermonkey.js"), "utf8");
for (const forbidden of ["CodeMirror", "querySelector", ".click(", "agent-browser", "saveScript\""]) {
    assert.equal(source.includes(forbidden), false, `Tampermonkey UI/private-CRUD fallback returned: ${forbidden}`);
}
for (const required of ["loadTree", "modifyScriptOptions", "action: \"list\"", "action: \"get\"", "action: \"patch\"", "action: \"put\"", "action: \"delete\""]) {
    assert(source.includes(required), `Tampermonkey hybrid backend is missing: ${required}`);
}
for (const required of ["validateBundledEditors", "prepareManagedEditors", "BUNDLED_EDITORS_ROOT", "extensionIdFromPublicKey"]) {
    assert(source.includes(required), `Tampermonkey bundled Editors support is missing: ${required}`);
}
for (const forbidden of ["clients2.google.com", "downloadBuffer(", "https.get(", "Expand-Archive"]) {
    assert.equal(source.includes(forbidden), false, `Tampermonkey runtime download path returned: ${forbidden}`);
}

function once(socket, event) {
    return new Promise((resolve, reject) => {
        socket.once(event, resolve);
        if (event !== "error") socket.once("error", reject);
    });
}

async function testExternalBridgeProtocol() {
    const bridge = new tampermonkey.ExternalBridge();
    const port = await bridge.port();
    const socket = new WebSocket(`ws://localhost:${port}`);
    try {
        await once(socket, "open");
        socket.send(JSON.stringify({ method: "auth", token: bridge.auth }));
        const authReply = JSON.parse(String(await once(socket, "message")));
        assert.equal(authReply.method, "auth", "External bridge did not return auth challenge");
        assert.equal(authReply.token, bridge.echo, "External bridge returned the wrong echo token");
        socket.send(JSON.stringify({ method: "authOK" }));
        await bridge.connected;

        const commandSeen = once(socket, "message");
        const responsePromise = bridge.command({ action: "list" });
        const command = JSON.parse(String(await commandSeen));
        assert.equal(command.action, "list", "External bridge command action mismatch");
        assert(command.messageId, "External bridge command is missing messageId");
        socket.send(JSON.stringify({
            id: command.messageId,
            response: { messageId: command.messageId, list: [] }
        }));
        const response = await responsePromise;
        assert.deepEqual(response.list, [], "External bridge did not correlate the response");
    } finally {
        try { socket.close(); } catch {}
        await bridge.dispose();
    }
}

testExternalBridgeProtocol().then(() => {
    console.log("[workbench] TAMPERMONKEY HYBRID CONTRACT TEST PASS");
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
