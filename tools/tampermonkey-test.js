const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tampermonkey = require("./tampermonkey");

assert(
    tampermonkey.TAMPERMONKEY_IDS.includes("dhdgffkkebhmkfjojejmpbldmpobfkfo"),
    "stable Tampermonkey extension id missing"
);

for (const name of [
    "findTampermonkeyExtension",
    "fastReadSource",
    "fastSnapshot",
    "fastCreateScript",
    "fastUpdateScript",
    "fastDeleteScript",
    "prepare",
    "restore",
    "finish"
]) {
    assert.equal(typeof tampermonkey[name], "function", `missing Tampermonkey Fast API surface: ${name}`);
}

const source = fs.readFileSync(path.join(__dirname, "tampermonkey.js"), "utf8");
for (const forbidden of [
    "WebSocketServer",
    "require(\"ws\")",
    "ExternalBridge",
    "findEditorsExtension",
    "externalReadSource",
    "externalPatchSource",
    "snapshotWithFallback",
    "updateScriptWithFallback",
    "CodeMirror",
    "querySelector",
    "agent-browser"
]) {
    assert.equal(source.includes(forbidden), false, `Tampermonkey non-Fast fallback returned: ${forbidden}`);
}

for (const required of [
    "loadTree",
    "options.scripts.userscripts",
    "options.scripts.userscripts.source",
    "modifyScriptOptions",
    "saveScript",
    "purgeScripts",
    "internal-fast-api"
]) {
    assert(source.includes(required), `Tampermonkey Fast-only backend is missing: ${required}`);
}

console.log("[workbench] TAMPERMONKEY FAST-API CONTRACT TEST PASS");
