/** A second verb available on the crop currently named by the world prompt. */
export interface ContextualCropChoice {
  cropId: string;
  action: "harvest" | "water" | "fertilize";
  label: string;
  detail: string | null;
}
