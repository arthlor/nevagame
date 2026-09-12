import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { EquipmentSlot } from "../simulation/core/types";
import { ASSET_IDS } from "../render/assets/AssetCatalog";
import { AssetLoader } from "../render/loaders/AssetLoader";
import { CANONICAL_RENDER_CONFIG } from "../render/config/VisualRenderConfig";
import {
  CharacterEquipmentAssembler,
  type CharacterToolKey,
  type CharacterVisualLoadout
} from "../render/animation/CharacterEquipmentAssembler";

export interface CharacterPreview3DProps {
  loadout: CharacterVisualLoadout;
  selectedSlot: EquipmentSlot | "rod" | null;
  descriptionId: string;
}

function toolKeyForSlot(slot: CharacterPreview3DProps["selectedSlot"]): CharacterToolKey | null {
  if (slot === "watering-tool") return "water";
  if (slot === "harvest-tool") return "sickle";
  if (slot === "rod") return "rod";
  return null;
}

/** Real GLB preview using the same assembler and loader clones as the world. */
export const CharacterPreview3D: React.FC<CharacterPreview3DProps> = ({
  loadout,
  selectedSlot,
  descriptionId
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const assemblerRef = useRef<CharacterEquipmentAssembler | null>(null);
  const loadoutRef = useRef(loadout);
  const selectedSlotRef = useRef(selectedSlot);
  const [rendererFallback, setRendererFallback] = useState<string | null>(null);
  const [characterFallback, setCharacterFallback] = useState<string | null>(null);
  const [equipmentFallback, setEquipmentFallback] = useState<string | null>(null);
  const fallback = rendererFallback ?? characterFallback ?? equipmentFallback;

  loadoutRef.current = loadout;
  selectedSlotRef.current = selectedSlot;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    let assembler: CharacterEquipmentAssembler | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Group | null = null;
    const canvas = document.createElement("canvas");
    canvas.className = "character-preview-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      console.warn("[CharacterPreview] WebGL preview unavailable", error);
      setRendererFallback("3D preview unavailable. Your equipped gear is still listed beside the preview.");
      canvas.remove();
      return;
    }
    renderer.outputColorSpace = CANONICAL_RENDER_CONFIG.outputColorSpace;
    renderer.toneMapping = CANONICAL_RENDER_CONFIG.toneMapping;
    renderer.toneMappingExposure = CANONICAL_RENDER_CONFIG.exposure;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 30);
    camera.position.set(2.65, 1.6, 3.7);
    camera.lookAt(0, 0.92, 0);
    scene.add(new THREE.HemisphereLight(
      CANONICAL_RENDER_CONFIG.skyFill.skyColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.groundColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.intensity
    ));
    const key = new THREE.DirectionalLight(
      CANONICAL_RENDER_CONFIG.sun.colorHex,
      CANONICAL_RENDER_CONFIG.sun.intensity
    );
    key.position.set(-3, 4.5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(
      CANONICAL_RENDER_CONFIG.moon.colorHex,
      CANONICAL_RENDER_CONFIG.moon.intensity
    );
    rim.position.set(3, 2.5, -3);
    scene.add(rim);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();
    const resize = (): void => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setPixelRatio(Math.min(
        window.devicePixelRatio || 1,
        1.5,
        CANONICAL_RENDER_CONFIG.quality[CANONICAL_RENDER_CONFIG.qualityTier].pixelRatioCap
      ));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const contextLost = (event: Event): void => {
      event.preventDefault();
      setRendererFallback("3D preview paused after a graphics reset. The loadout remains safe.");
    };
    const contextRestored = (): void => setRendererFallback(null);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);

    const showSelectedTool = (): void => {
      assembler?.hideTools();
      const tool = toolKeyForSlot(selectedSlotRef.current);
      if (tool) assembler?.setToolVisible(tool, true);
    };

    void AssetLoader.loadModel(ASSET_IDS.CHAR_PLAYER_A).then(async (loaded) => {
      if (disposed) return;
      model = loaded;
      model.name = "character_screen_preview";
      model.rotation.y = -0.34;
      scene.add(model);
      setCharacterFallback(null);
      assembler = new CharacterEquipmentAssembler(model, {
        onAssetError: (assetId, error) => {
          console.warn(`[CharacterPreview] ${assetId} could not be shown`, error);
        },
        onSyncSettled: (failedAssetIds) => {
          if (disposed) return;
          setEquipmentFallback(failedAssetIds.length > 0
            ? "One gear model could not be shown. The text comparison is still accurate."
            : null);
        }
      });
      assemblerRef.current = assembler;
      await assembler.sync(loadoutRef.current);
      if (disposed) return;
      showSelectedTool();
      const clips = model.userData.animationClips as THREE.AnimationClip[] | undefined;
      const idle = clips?.find((clip) => clip.name === "idle");
      if (idle) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idle).play();
      }
    }).catch((error) => {
      console.warn("[CharacterPreview] Character model could not be loaded", error);
      if (!disposed) setCharacterFallback("3D preview unavailable. The text comparison remains accurate.");
    });

    const animate = (): void => {
      if (disposed) return;
      const delta = Math.min(0.05, clock.getDelta());
      mixer?.update(delta);
      if (model && !reducedMotion.matches) {
        model.rotation.y = -0.34 + Math.sin(clock.elapsedTime * 0.45) * 0.12;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      assembler?.dispose();
      assemblerRef.current = null;
      mixer?.stopAllAction();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  // GameApp re-renders every frame with a fresh loadout object, so the effect
  // keys on its content: an identity dependency re-synced the gear each frame.
  const loadoutKey = JSON.stringify(loadout);
  useEffect(() => {
    const assembler = assemblerRef.current;
    if (!assembler) return;
    let cancelled = false;
    void assembler.sync(loadoutRef.current).then(() => {
      // A newer selection, or the preview unmounting, supersedes this sync.
      if (cancelled || assemblerRef.current !== assembler) return;
      assembler.hideTools();
      const tool = toolKeyForSlot(selectedSlotRef.current);
      if (tool) assembler.setToolVisible(tool, true);
    });
    return () => { cancelled = true; };
  }, [loadoutKey, selectedSlot]);

  return (
    <div ref={hostRef} className="character-preview-3d" role="img" aria-labelledby={descriptionId}>
      {fallback && <p className="character-preview-fallback" role="status">{fallback}</p>}
    </div>
  );
};
