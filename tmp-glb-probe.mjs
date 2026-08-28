import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const document = await io.read("public/assets/models/bridge_stone_a.glb");
const root = document.getRoot();
for (const node of root.listNodes()) {
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  if (node.getName().includes("bridge") || node.getName().includes("COL_")) {
    console.log(JSON.stringify({ name: node.getName(), t, r, s }));
  }
}
