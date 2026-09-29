const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "workbench.config.json");

function numberOverride(value, fallback) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid numeric override: ${value}`);
    return parsed;
}

function loadConfig(env = process.env) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    config.devServer ||= {};
    config.browser ||= {};
    config.userscript ||= {};

    if (env.BPW_SOURCE) config.userscript.sourcePath = env.BPW_SOURCE;
    if (env.BPW_TARGET_URL) config.targetUrl = env.BPW_TARGET_URL;
    if (env.BPW_USERSCRIPT_MANAGER) config.userscript.manager = String(env.BPW_USERSCRIPT_MANAGER).trim().toLowerCase();
    config.devServer.port = numberOverride(env.BPW_DEV_PORT, Number(config.devServer.port || 8890));
    config.browser.cdpPort = numberOverride(env.BPW_CDP_PORT, Number(config.browser.cdpPort || 9222));
    if (env.BPW_AGENT_SESSION) config.browser.agentSession = env.BPW_AGENT_SESSION;
    if (env.CENT_CDP_SKILL) config.browser.centCdpSkill = env.CENT_CDP_SKILL;
    return config;
}

function resolveSourcePath(config) {
    const raw = config.userscript?.sourcePath || config.userscript?.entry;
    if (!raw) throw new Error("userscript.sourcePath or userscript.entry is required");
    return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(ROOT, raw);
}

module.exports = { ROOT, CONFIG_PATH, loadConfig, resolveSourcePath };
