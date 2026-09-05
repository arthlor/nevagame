import React from "react";
import {
  UI_ATLAS_PAGES,
  getAtlasPageUrl,
  getAtlasSprite
} from "../atlas/AtlasManifest";

interface AtlasImageProps {
  src?: string | null;
  size?: number;
  fit?: "contain" | "fill";
  alt?: string;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  id?: string;
  role?: React.AriaRole;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}

function spriteKeyFromUrl(src: string): string | null {
  const pathname = src.split("?", 1)[0] ?? src;
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return filename.endsWith(".png") ? decodeURIComponent(filename) : null;
}

export const AtlasImage: React.FC<AtlasImageProps> = ({
  src,
  alt = "",
  className,
  size,
  fit = "contain",
  title,
  style,
  id,
  role,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel
}) => {
  const clipId = React.useId();
  if (!src) return null;
  const key = spriteKeyFromUrl(src);
  const sprite = getAtlasSprite(key);
  const page = sprite ? UI_ATLAS_PAGES[sprite.page] : undefined;
  const classNames = `atlas-image ${className ?? ""}`.trim();
  if (sprite && page) {
    const decorative = ariaHidden === true || ariaHidden === "true" || (!alt && !ariaLabel && !title);
    return (
      <svg
        id={id}
        className={classNames}
        width={size}
        height={size}
        viewBox={`${sprite.frame.x} ${sprite.frame.y} ${sprite.frame.w} ${sprite.frame.h}`}
        preserveAspectRatio={fit === "fill" ? "none" : "xMidYMid meet"}
        role={decorative ? undefined : role ?? "img"}
        aria-hidden={decorative ? true : ariaHidden}
        aria-label={decorative ? undefined : ariaLabel ?? alt}
        focusable="false"
        style={style}
      >
        {title && !decorative ? <title>{title}</title> : null}
        <defs>
          <clipPath id={clipId}>
            <rect x={sprite.frame.x} y={sprite.frame.y} width={sprite.frame.w} height={sprite.frame.h} />
          </clipPath>
        </defs>
        <image href={getAtlasPageUrl(sprite.page, "webp")} width={page.width} height={page.height} clipPath={`url(#${clipId})`} />
      </svg>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      id={id}
      className={classNames}
      width={size}
      height={size}
      title={title}
      style={style}
      role={role}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      draggable={false}
    />
  );
};
