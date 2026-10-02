"""Render only the clean cartographic base; no text, discoveries or POI glyphs.

The palette, hillshade and canopy treatment retain the selected atlas study.
All geography is extracted from current TypeScript owners; this module owns only
cartographic presentation. It needs no fonts, display server or browser.
"""
import json
import math
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter


def rgb(value):
    return tuple(bytes.fromhex(value.lstrip("#")))


def draw_line(draw, points, fill, width=1):
    if len(points) > 1:
        draw.line(points, fill=fill, width=max(1, round(width)), joint="curve")


def draw_dash(draw, points, fill, width=2, on=9, off=6):
    phase, drawing = 0, True
    for start, end in zip(points, points[1:]):
        distance = math.dist(start, end)
        if distance < 0.001:
            continue
        position = 0
        while position < distance:
            interval = on if drawing else off
            length = min(interval - phase, distance - position)
            if drawing:
                points_on_line = tuple(
                    tuple(start[axis] + (end[axis] - start[axis]) * offset / distance for axis in (0, 1))
                    for offset in (position, position + length)
                )
                draw.line(points_on_line, fill=fill, width=width)
            position += length
            phase += length
            if phase >= interval:
                phase, drawing = 0, not drawing


def render(directory):
    config = json.loads((Path(__file__).parent / "config.json").read_text())
    data = json.loads((directory / "world-data.json").read_text())
    projection = data["projection"]
    bounds = projection["bounds"]
    width, height = projection["width"], projection["height"]
    padding, scale = projection["paddingPixels"], projection["pixelsPerWorldUnit"]

    def pixel(point):
        x, z = point[:2] if isinstance(point, (list, tuple)) else (point["x"], point["z"])
        return padding + (x - bounds["minX"]) * scale, padding + (z - bounds["minZ"]) * scale

    def path(points):
        return [pixel(point) for point in points]

    sample = data["terrain"]
    shape, step = (sample["height"], sample["width"]), sample["step"]
    elevation = np.fromfile(directory / sample["file"], dtype="<f4").reshape(shape)
    water = np.fromfile(directory / sample["waterFile"], dtype="uint8").reshape(shape)
    # Canonical wet/dry membership, including the rendered southern shore, replaces
    # the study's hand-trimmed coastline and duplicate lake formula.
    land = (elevation > 0) & (water == 0)
    smooth = gaussian_filter(elevation, 0.65)
    gradient_z, gradient_x = np.gradient(smooth, step)
    nx, ny, nz = -gradient_x * 2.2, -gradient_z * 2.2, np.ones_like(elevation)
    normal_length = np.sqrt(nx * nx + ny * ny + nz * nz)
    light = np.clip((nx * -0.48 + ny * -0.55 + nz * 0.68) / normal_length, 0.08, 1)
    shade = 0.68 + 0.44 * light
    stops = np.array([-20, 0, 2, 10, 25, 50, 85, 140])
    colors = np.array([rgb(color) for color in [
        "#275560", "#75a9a1", "#c2c995", "#acbc82", "#9aaa77", "#b4b38c", "#c4b496", "#e2d5b8"
    ]])
    pixels = np.stack([np.interp(elevation, stops, colors[:, channel]) for channel in range(3)], axis=-1)
    biome_weights = np.fromfile(directory / sample["biomeFile"], dtype="uint8").reshape((*shape, 4))
    biome = np.argmax(biome_weights, axis=2)
    for code, color, amount in [(1, "#708d69", 0.24), (2, "#b7b77a", 0.15), (3, "#b6ac93", 0.12)]:
        mask = (biome == code) & land
        pixels[mask] = pixels[mask] * (1 - amount) + np.array(rgb(color)) * amount
    random = np.random.default_rng(config["grainSeed"])
    grain = random.normal(0, 0.65, elevation.shape)
    pixels[land] *= shade[land, None]
    pixels += grain[:, :, None]
    # Decorative nearshore tint, never a quantitative depth contour.
    shore_distance = distance_transform_edt(~land) * step
    shallow = np.exp(-shore_distance / 22.0)
    sea = (np.array(rgb("#285762"))[None, None, :] * (1 - shallow[:, :, None])
           + np.array(rgb("#86b1a6"))[None, None, :] * shallow[:, :, None])
    sea_grain = gaussian_filter(random.normal(0, 1, elevation.shape), 2)
    pixels[~land] = sea[~land] + sea_grain[~land, None]
    terrain = Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).resize(
        (width - 2 * padding, height - 2 * padding), Image.Resampling.BICUBIC)
    image = Image.new("RGB", (width, height), rgb("#275560"))
    image.paste(terrain, (padding, padding))
    draw = ImageDraw.Draw(image)
    for island in data["islands"]:
        points = path(island["coastLoop"])
        draw_line(draw, points + [points[0]], "#42695d", 6)
        draw_line(draw, points + [points[0]], "#e0d7a9", 2)

    # Terrain contours, not stylized/invented mountain silhouettes.
    figure, axes = plt.subplots()
    xs = np.linspace(bounds["minX"], bounds["maxX"], shape[1])
    zs = np.linspace(bounds["minZ"], bounds["maxZ"], shape[0])
    contours = axes.contour(xs, zs, smooth, levels=np.arange(10, 201, 10))
    for level, segments in zip(contours.levels, contours.allsegs):
        for segment in segments:
            if len(segment) > 2:
                draw_line(draw, path(segment.tolist()), "#797b59" if level % 50 else "#6c7052", 1 if level % 50 else 2)
    plt.close(figure)

    hydro = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(hydro)
    for polygon in [data["riverPolygon"], *data["mainlandWaterPolygons"]]:
        points = path(polygon)
        draw.polygon(points, fill="#5f9b9b")
        draw_line(draw, points + [points[0]], "#3e726d", 2)
    for brook in data["brooks"]:
        draw_line(draw, path(brook["knots"]), "#3a7576", 3)
    # Clip river end-caps at the coast so the estuary joins the ocean.
    coast_mask = Image.new("L", image.size, 0)
    coast_draw = ImageDraw.Draw(coast_mask)
    for island in data["islands"]:
        coast_draw.polygon(path(island["coastLoop"]), fill=255)
    hydro.putalpha(Image.fromarray(np.minimum(np.array(hydro.getchannel("A")), np.array(coast_mask))))
    image = Image.alpha_composite(image.convert("RGBA"), hydro).convert("RGB")
    draw = ImageDraw.Draw(image)

    # Stable sparse canopy symbols at actual seed-owned placements.
    tree_cells = set()
    for tree in sorted(data["trees"], key=lambda item: (item["z"], item["id"])):
        x, y = pixel(tree)
        cell = round(x / 16), round(y / 16)
        ix, iz = round((tree["x"] - sample["minX"]) / step), round((tree["z"] - sample["minZ"]) / step)
        if cell in tree_cells or not (0 <= iz < shape[0] and 0 <= ix < shape[1]) or elevation[iz, ix] < 0.4:
            continue
        tree_cells.add(cell)
        draw.ellipse((x - 4, y - 2, x + 8, y + 10), fill="#81906a")
        if "pine" in tree["assetId"] or "cypress" in tree["assetId"]:
            draw.polygon([(x, y - 12), (x - 6, y + 4), (x + 6, y + 4)], fill="#687e57")
            draw.line((x, y - 9, x - 4, y + 2), fill="#aabb7f", width=2)
        else:
            draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill="#738657")
            draw.arc((x - 6, y - 6, x + 6, y + 6), 180, 295, fill="#b6c28a", width=2)

    for route in sorted(data["routes"], key=lambda item: item.get("scope") == "regional"):
        points = path(route["points"])
        if route["kind"] == "trail":
            draw_dash(draw, points, "#827354")
        else:
            road_width = max(4, min(13, route["widthMeters"] * scale + 1))
            draw_line(draw, points, "#77674d", road_width + 2)
            draw_line(draw, points, "#e0cba1", road_width)
    for farm in data["farms"]:
        for area in farm["plantableAreas"]:
            origin = farm["origin"]
            start = pixel({"x": origin["x"] + area["minX"], "z": origin["z"] + area["minZ"]})
            end = pixel({"x": origin["x"] + area["maxX"], "z": origin["z"] + area["maxZ"]})
            draw.rectangle((start, end), fill="#b1a377", outline="#827858", width=2)
            for fraction in (0.2, 0.4, 0.6, 0.8):
                y = start[1] + (end[1] - start[1]) * fraction
                draw.line((start[0], y, end[0], y), fill="#d2bd8c", width=1)
    for building in data["staticPlacements"]:
        half_x, half_z = building.get("grounding", [2.5, 2])
        size = building["scale"]
        half_x, half_z = half_x * size[0], half_z * size[2]
        cosine, sine = math.cos(building["rotationY"]), math.sin(building["rotationY"])
        points = path([{"x": building["x"] + x * cosine + z * sine, "z": building["z"] - x * sine + z * cosine}
                       for x, z in [(-half_x, -half_z), (half_x, -half_z), (half_x, half_z), (-half_x, half_z)]])
        draw.polygon(points, fill="#aa7758")
        draw_line(draw, points + [points[0]], "#655843")
        draw_line(draw, points[:2], "#e2bd82", 2)
    for bridge in data["bridges"]:
        points = path(bridge["polygon"])
        draw.polygon(points, fill="#e0c49a")
        draw_line(draw, points + [points[0]], "#685642", 2)

    # The master remains temporary evidence. Only the bounded clean WebP ships.
    image.save(directory / "base.png", optimize=True)
    texture_width = config["textureWidth"]
    texture_height = round(height * texture_width / width)
    image.resize((texture_width, texture_height), Image.Resampling.LANCZOS).save(
        directory / config["textureFile"], quality=config["webpQuality"], method=6)
    print(f"Rendered clean base {width}×{height}; runtime {texture_width}×{texture_height}.", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: render.py <extraction-directory>")
    render(Path(sys.argv[1]))
