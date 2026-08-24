"""Headless Blender entrypoint for catalog-driven Neva generation."""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common.pipeline import clean_scene, create_root, validate_and_export
from generators.registry import resolve_generator


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Generate Neva GLBs from the asset catalog")
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--asset", action="append", default=[])
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args(arguments)


def main() -> None:
    args = parse_args()
    catalog_path = Path(args.catalog).resolve()
    output_dir = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    with catalog_path.open("r", encoding="utf-8") as catalog_file:
        catalog = json.load(catalog_file)

    requested = set(args.asset)
    selected = [asset for asset in catalog["assets"] if not requested or asset["id"] in requested]
    missing = sorted(requested - {asset["id"] for asset in selected})
    if missing:
        raise ValueError(f"Unknown requested asset IDs: {missing}")

    results = []
    started = time.perf_counter()
    for index, spec in enumerate(selected, start=1):
        asset_started = time.perf_counter()
        print(f"[NEVA ART] [{index}/{len(selected)}] Generating {spec['id']}")
        clean_scene()
        root = create_root(spec["rootNode"])
        generator = resolve_generator(spec["generator"])
        generator(spec, root)
        result = validate_and_export(spec, output_dir / spec["file"])
        result["durationMs"] = round((time.perf_counter() - asset_started) * 1000)
        results.append(result)
        print(
            f"[NEVA ART] {spec['id']}: {result['triangles']} triangles, "
            f"{len(result['materials'])} materials"
        )

    summary = {
        "assetCount": len(results),
        "onTarget": sum(result["qualityStatus"] == "on_target" for result in results),
        "belowTarget": sum(result["qualityStatus"] == "below_target" for result in results),
        "triangles": sum(result["triangles"] for result in results),
        "productionMinimumTriangles": sum(result["budget"]["trianglesMin"] for result in results),
        "qualityTargetTriangles": sum(result["budget"]["trianglesTarget"] for result in results),
        "hardMaximumTriangles": sum(result["budget"]["trianglesMax"] for result in results),
        "fileSizeBytes": sum(result["fileSizeBytes"] for result in results),
    }
    report = {
        "catalogVersion": catalog["version"],
        "blenderVersion": bpy.app.version_string,
        "durationMs": round((time.perf_counter() - started) * 1000),
        "strict": args.strict,
        "summary": summary,
        "assets": results,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.strict and summary["belowTarget"]:
        raise RuntimeError(
            f"Strict quality gate rejected {summary['belowTarget']} below-target assets; "
            f"see {report_path}"
        )
    print(f"[NEVA ART] Generated {len(results)} assets with Blender {bpy.app.version_string}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
