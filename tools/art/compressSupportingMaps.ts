import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { POLYHAVEN_SURFACE_TEXTURES } from "../../src/render/materials/ExternalSurfaceTextures";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const outputArg = option("--output");
if (!outputArg) throw new Error("Supply --output for a candidate directory; raster sources are never overwritten.");
const output = path.resolve(outputArg);
const encoder = option("--encoder") ?? "ktx";
const encoderVersion = execFileSync(encoder, ["--version"], { encoding: "utf8" }).trim();
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(path.join(output, ".inputs-"));
const records: object[] = [];
try {
  for (const [id, spec] of Object.entries(POLYHAVEN_SURFACE_TEXTURES)) {
    const input = path.resolve("public", spec.sourceUrl.slice(1));
    const bytes = await readFile(input);
    const { width, height } = await sharp(bytes).metadata();
    if (!width || !height || width % 4 || height % 4) throw new Error(`${id}: dimensions must be multiples of four`);
    const png = path.join(scratch, `${id}.png`);
    await sharp(bytes).removeAlpha().png().toFile(png);
    const target = path.join(output, path.basename(spec.url));
    const command = [
      "create", "--format", spec.kind === "color" ? "R8G8B8_SRGB" : "R8_UNORM",
      "--assign-tf", spec.kind === "color" ? "srgb" : "linear",
      // Raster TextureLoader flips Y; compressed textures require that flip baked in.
      "--assign-texcoord-origin", "top-left", "--convert-texcoord-origin", "bottom-left",
      "--generate-mipmap", "--mipmap-wrap", "wrap", "--encode", "basis-lz",
      "--qlevel", "255", "--clevel", "3", "--threads", "1",
      "--compare-ssim", "--compare-psnr", png, target
    ];
    const comparison = execFileSync(encoder, command, { encoding: "utf8" });
    execFileSync(encoder, ["validate", target], { encoding: "utf8" });
    const encoded = await readFile(target);
    const hash = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
    records.push({ id, sourceUrl: spec.sourceUrl, url: spec.url, sourcePage: spec.sourcePage,
      width, height, sourceBytes: bytes.length, encodedBytes: encoded.length,
      sourceHash: hash(bytes), encodedHash: hash(encoded), command: command.slice(0, -2), comparison });
    console.info(`${id}: ${bytes.length} -> ${encoded.length} bytes`);
  }
  await writeFile(path.join(output, "compression-report.json"), JSON.stringify({ encoderVersion, records }, null, 2) + "\n");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
