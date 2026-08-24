// src/render/camera/GameCamera.ts

import * as THREE from "three";
import { GameMode } from "../../simulation/core/types";
import { WorldLayout } from "../../world/WorldLayout";

export class GameCamera {
  public camera: THREE.PerspectiveCamera;
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  constructor(aspectRatio: number = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(47, aspectRatio, 0.1, 500);
    this.camera.position.set(4.8, 6.8, -12);
  }

  public update(
    targetPos: THREE.Vector3,
    targetHeadingRadians: number,
    mode: GameMode,
    deltaSeconds: number
  ): void {
    let offset: THREE.Vector3;
    let lookOffset: THREE.Vector3;
    const lerpFactor = 1 - Math.exp(-5.5 * deltaSeconds);

    switch (mode) {
      case "boat-driving":
        // Follow behind boat along its heading
        offset = new THREE.Vector3(
          -Math.sin(targetHeadingRadians) * 16,
          10,
          -Math.cos(targetHeadingRadians) * 16
        );
        lookOffset = new THREE.Vector3(
          Math.sin(targetHeadingRadians) * 6,
          1.5,
          Math.cos(targetHeadingRadians) * 6
        );
        break;

      case "sport-fishing":
        // Closer tactical view overlooking fishing line
        offset = new THREE.Vector3(0, 5.4, 9.5);
        lookOffset = new THREE.Vector3(0, 1.0, -10.0);
        break;

      case "on-foot":
      default:
        // Close third-person RPG framing: keeps the character grounded and clear
        // in the lower-middle third of the frame while looking forward along paths.
        offset = new THREE.Vector3(4.8, 6.8, -12.0);
        lookOffset = new THREE.Vector3(0.0, 1.0, 2.2);
        break;
    }

    const desiredCamPos = targetPos.clone().add(offset);
    desiredCamPos.y = Math.max(
      desiredCamPos.y,
      WorldLayout.terrainHeight(desiredCamPos.x, desiredCamPos.z) + 2.2
    );
    this.camera.position.lerp(desiredCamPos, lerpFactor);

    const desiredLookAt = targetPos.clone().add(lookOffset);
    this.currentLookAt.lerp(desiredLookAt, lerpFactor);
    this.camera.lookAt(this.currentLookAt);
  }

  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
