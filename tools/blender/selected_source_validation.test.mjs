import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGeneratorParameters, validateSourceProvenance } from "./cli.mjs";

const catalog = JSON.parse(fs.readFileSync(new URL("../../assets/specs/asset-catalog.json", import.meta.url), "utf8"));
const spec = catalog.assets.find((asset) => asset.id === "char_player_a");
const cowSpec = catalog.assets.find((asset) => asset.id === "fauna_cow_a");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("offline nonselected source validation keeps path/schema checks but does not consume a missing library", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"neva-selected-source-"));
  const asset={...spec,parameters:{sourceBlend:"art/prepared.blend",sourceCollection:"Character"},sourceProvenance:{...spec.sourceProvenance,sourceBlend:"art/prepared.blend"}};
  try {
    assert.equal(validateGeneratorParameters(asset,root,false),true);
    assert.equal(validateSourceProvenance(asset,root,false),asset.sourceProvenance);
    assert.throws(()=>validateGeneratorParameters(asset,root));
    assert.throws(()=>validateSourceProvenance(asset,root));
    for (const sourceBlend of ["../outside.blend","public/prepared.blend","generated/glb/prepared.blend","art/prepared.glb"]) {
      const invalid={...asset,parameters:{...asset.parameters,sourceBlend},sourceProvenance:{...asset.sourceProvenance,sourceBlend}};
      assert.throws(()=>validateGeneratorParameters(invalid,root,false));
      assert.throws(()=>validateSourceProvenance(invalid,root,false));
    }
    assert.throws(()=>validateSourceProvenance({...asset,sourceProvenance:{...asset.sourceProvenance,licenseUrl:"https://invalid.example/"}},root,false));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("source capture provenance verifies the immutable capture, audit, and license as one bundle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-source-capture-"));
  const sourceBlend = "art/prepared.blend";
  const sourceCapture = "art/sources/cow.blend";
  const sourceCaptureReport = "art/sources/cow-report.json";
  const licenseEvidence = "art/sources/cow.LICENSE.txt";
  const preparedBytes = Buffer.from("reviewed derivative");
  const captureBytes = Buffer.from("immutable provider capture");
  const captureSha = sha256(captureBytes);
  const provenance = {
    ...cowSpec.sourceProvenance,
    sourceBlend,
    sourceSha256: sha256(preparedBytes),
    sourceCapture,
    sourceCaptureSha256: captureSha,
    sourceCaptureReport,
    licenseEvidence,
  };
  const asset = {
    ...cowSpec,
    parameters: { ...cowSpec.parameters, sourceBlend },
    sourceProvenance: provenance,
  };
  fs.mkdirSync(path.join(root, "art/sources"), { recursive: true });
  fs.writeFileSync(path.join(root, sourceBlend), preparedBytes);
  fs.writeFileSync(path.join(root, sourceCapture), captureBytes);
  fs.writeFileSync(path.join(root, sourceCaptureReport), JSON.stringify({
    modelId: provenance.modelId,
    sourceUrl: provenance.sourceUrl,
    sourceBlend: sourceCapture,
    sourceSha256: captureSha,
    license: ["CC0 1.0"],
  }));
  fs.writeFileSync(
    path.join(root, licenseEvidence),
    `${provenance.modelId}\n${provenance.sourceUrl}\n${provenance.licenseUrl}\n`,
  );
  try {
    assert.equal(validateSourceProvenance(asset, root), provenance);
    fs.writeFileSync(path.join(root, sourceCapture), "tampered");
    assert.throws(() => validateSourceProvenance(asset, root), /sourceCapture SHA-256 mismatch/);
    fs.writeFileSync(path.join(root, sourceCapture), captureBytes);
    fs.writeFileSync(path.join(root, sourceCaptureReport), JSON.stringify({ modelId: "wrong" }));
    assert.throws(() => validateSourceProvenance(asset, root), /sourceCapture report/);
    fs.writeFileSync(path.join(root, sourceCaptureReport), JSON.stringify({
      modelId: provenance.modelId,
      sourceUrl: provenance.sourceUrl,
      sourceBlend: sourceCapture,
      sourceSha256: captureSha,
      license: ["CC0 1.0"],
    }));
    fs.writeFileSync(path.join(root, licenseEvidence), provenance.modelId);
    assert.throws(() => validateSourceProvenance(asset, root), /licenseEvidence is incomplete/);
    const partial = {
      ...asset,
      sourceProvenance: { ...provenance, sourceCaptureReport: undefined },
    };
    delete partial.sourceProvenance.sourceCaptureReport;
    assert.throws(() => validateSourceProvenance(partial, root, false), /invalid sourceProvenance/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
