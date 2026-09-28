export interface PlantingSeedChoice {
  cropId: string;
  count: number;
}

/**
 * Keeps the crop the player chose. Another stack of the same crop continues;
 * running out does not substitute a different crop.
 */
export function continuedPlantingCrop(
  rememberedCropId: string | null,
  seeds: readonly PlantingSeedChoice[]
): { cropId: string | null; exhausted: boolean } {
  if (!rememberedCropId) {
    return { cropId: null, exhausted: !seeds.some((seed) => seed.count > 0) };
  }
  const stillHeld = seeds.some((seed) => seed.cropId === rememberedCropId && seed.count > 0);
  if (stillHeld) return { cropId: rememberedCropId, exhausted: false };
  return { cropId: rememberedCropId, exhausted: true };
}
