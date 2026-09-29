# Tampermonkey Editors vendored companion

This directory contains the official **Tampermonkey Editors 1.0.7** Chrome extension payload used by Browser Plugin Workbench as an offline companion for Tampermonkey's External `userscripts` API.

- Upstream repository: `https://github.com/Tampermonkey/tampermonkey-editors`
- Upstream tag: `1.0.7`
- Upstream commit: `cabbb288f5d7b7734c4ff88a4cefef97d301c633`
- Official Chrome extension ID: `lieodnapokbjkkdkhdljlllmgkmdokcm`
- Official CRX SHA-256 verified during vendoring: `9c7086a68b1e521dc11d1cb72c94ea0d8b59b9555c46fc43005eb20fa53ce58a`
- License: MIT (`LICENSE` in this directory)

The extension payload comes from the official Chrome package. BPW adds only the public `manifest.key` extracted and verified from that official CRX3 package so Chrome assigns the same official extension ID when the payload is loaded unpacked. No Tampermonkey Editors application logic is modified by BPW.

Store-only `_metadata/verified_contents.json` is intentionally not vendored because the unpacked manifest contains the added public `key` field.
