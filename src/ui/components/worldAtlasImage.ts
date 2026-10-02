/** A single open-modal decode. Closing cancels delivery and releases our reference. */
export function loadWorldAtlasImage(
  url: string,
  onReady: () => void,
  onError: () => void,
  createImage: () => Pick<HTMLImageElement, "src" | "decoding" | "decode"> = () => new Image()
): () => void {
  let active = true;
  const image = createImage();
  image.decoding = "async";
  image.src = url;
  void image.decode().then(() => { if (active) onReady(); }, () => { if (active) onError(); });
  return () => {
    active = false;
    image.src = "";
  };
}
