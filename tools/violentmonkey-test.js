const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("./violentmonkey");
const ROOT = path.resolve(__dirname, "..");
const MODULE_PATH = path.join(__dirname, "violentmonkey.js");
const CLI_PATH = path.join(ROOT, "bin", "bpw.js");

for (const name of [
    "findExtensionId",
    "createTarget",
    "findTargetByUrl",
    "closeTargetById",
    "findBackgroundTarget",
    "hasBackgroundApi",
    "inspectBackground",
    "activateBackground",
    "restoreBackground",
    "finishBackground",
    "reloadTargetById"
]) {
    assert.equal(typeof api[name], "function", `missing background/CDP API: ${name}`);
}

for (const name of [
    "controller",
    "candidateRows",
    "inspect",
    "activate",
    "restore",
    "complete",
    "promote",
    "reloadTarget"
]) {
    assert.equal(api[name], undefined, `legacy UI fallback export must stay removed: ${name}`);
}

const moduleSource = fs.readFileSync(MODULE_PATH, "utf8");
for (const forbidden of ["CodeMirror", "querySelector", "agent-browser", "browserBatch("]) {
    assert.equal(moduleSource.includes(forbidden), false, `Violentmonkey UI fallback returned: ${forbidden}`);
}
assert(moduleSource.includes("UI fallback is disabled"), "fail-closed background API error is missing");

const cliSource = fs.readFileSync(CLI_PATH, "utf8");
for (const forbidden of ["violentmonkey.controller", "transport: \"ui\"", "violentmonkey.promote", "violentmonkey.restore("]) {
    assert.equal(cliSource.includes(forbidden), false, `CLI UI fallback returned: ${forbidden}`);
}
assert(cliSource.includes("Violentmonkey background API is unavailable; UI fallback is disabled"), "CLI must fail closed when background API is unavailable");

console.log("[workbench] VIOLENTMONKEY BACKGROUND-API CONTRACT TEST PASS");
