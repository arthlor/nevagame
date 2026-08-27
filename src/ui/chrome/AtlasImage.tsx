import React from "react";

interface AtlasImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  size?: number;
}

export const AtlasImage: React.FC<AtlasImageProps> = ({ src, alt = "", className, size, ...rest }) => {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={`atlas-image ${className ?? ""}`.trim()}
      width={size}
      height={size}
      draggable={false}
      {...rest}
    />
  );
};
