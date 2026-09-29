# Retained published sources

These GLBs retain the existing published geometry for the selected frozen
families while their catalog entries gain simple collision proxies. They use
the ordinary `authored_glb` source path permitted by `LLM/ASSET_PRODUCTION.md`;
no frozen generator was run and no external provider was called.

`provenance.json` records each former generator, parameter payload and retained
source hash. The catalog still owns runtime IDs, palette, nodes, budgets and
collision. Changes publish through `npm run art:generate -- --asset <id>`.
