const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function metadataIdentity(source) {
    const block = source.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
    if (!block) throw new Error("Userscript metadata block not found");
    const directive = (key) => {
        const line = block[0].split(/\r?\n/).find((item) => new RegExp(`^\\s*//\\s*@${key}\\s+`, "i").test(item));
        return line?.replace(new RegExp(`^\\s*//\\s*@${key}\\s+`, "i"), "").trim() || "";
    };
    const name = directive("name");
    const namespace = directive("namespace");
    if (!name || !namespace) throw new Error("metadata must contain @name and @namespace");
    return { name, namespace };
}

function sourceIdentity(file) {
    const source = fs.readFileSync(file, "utf8");
    const metadata = metadataIdentity(source);
    const identity = JSON.stringify([path.normalize(path.resolve(file)).toLowerCase(), metadata.name, metadata.namespace]);
    return { ...metadata, token: crypto.createHash("sha256").update(identity).digest("hex") };
}

module.exports = { metadataIdentity, sourceIdentity };
