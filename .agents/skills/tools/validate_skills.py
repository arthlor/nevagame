#!/usr/bin/env python3
"""Validate the Three.js skill pack.

Deterministic checks only: frontmatter, links, cross-references, runtime
contracts, gating pointers, manifest coverage, and mirror drift. No network.

Usage:
    python3 tools/validate_skills.py [--root DIR] [--strict]

Exit codes:
    0 all checks pass
    1 one or more errors (or warnings with --strict)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

LINK_RE = re.compile(r"\]\(([^)]+)\)")
SKILL_REF_RE = re.compile(r"\$threejs-[a-z0-9-]+")
NON_MANIFEST = {"gauntlet-loop", "threejs-skill-router"}
# Tooling/meta skills have no rendering backend to declare.
NO_CONTRACT = {
    "threejs-3d-generator",
    "threejs-image-generator",
    "threejs-audio-generator",
    "threejs-skill-router",
}


def split_frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fields: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" in line:
            key, _, value = line.partition(":")
            fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields


def digest_tree(root: str, rels: list[str]) -> dict[str, str]:
    out = {}
    for rel in rels:
        path = os.path.join(root, rel)
        with open(path, "rb") as handle:
            out[rel] = hashlib.sha256(handle.read()).hexdigest()
    return out


def relative_files(root: str) -> list[str]:
    found = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            found.append(os.path.relpath(full, root))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Three.js skill pack")
    parser.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    parser.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = parser.parse_args()
    root = os.path.abspath(args.root)

    errors: list[str] = []
    warnings: list[str] = []

    manifest_path = os.path.join(root, "manifest.json")
    try:
        manifest = json.load(open(manifest_path, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FATAL cannot read manifest.json: {exc}")
        return 1
    manifest_names = {entry["name"] for entry in manifest["skills"]}

    skill_dirs = sorted(
        name for name in os.listdir(root)
        if os.path.isfile(os.path.join(root, name, "SKILL.md"))
    )
    dir_names = set(skill_dirs)

    for name in sorted(manifest_names - dir_names):
        errors.append(f"manifest lists missing skill dir: {name}")
    for name in sorted(dir_names - manifest_names - NON_MANIFEST):
        errors.append(f"skill dir missing from manifest.json: {name}")

    all_refs: set[str] = set()
    for name in skill_dirs:
        skill_dir = os.path.join(root, name)
        skill_path = os.path.join(skill_dir, "SKILL.md")
        text = open(skill_path, encoding="utf-8").read()
        fields = split_frontmatter(text)

        if fields.get("name") != name:
            errors.append(f"{name}: frontmatter name {fields.get('name')!r} != dir")
        desc = fields.get("description", "")
        if not desc:
            errors.append(f"{name}: missing description")
        elif len(desc) > 400:
            warnings.append(f"{name}: description is {len(desc)} chars (>400)")

        if not os.path.isfile(os.path.join(skill_dir, "agents", "openai.yaml")):
            errors.append(f"{name}: missing agents/openai.yaml")

        if name.startswith("threejs-"):
            if name not in NO_CONTRACT and "Runtime contract.**" not in text and "Stack contract.**" not in text:
                errors.append(f"{name}: missing Runtime/Stack contract line")
            if "`../CONVENTIONS.md`" not in text:
                errors.append(f"{name}: missing CONVENTIONS.md gating pointer")

        for target in LINK_RE.findall(text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            bare = target.split("#", 1)[0]
            if not bare:
                continue
            if not os.path.exists(os.path.normpath(os.path.join(skill_dir, bare))):
                errors.append(f"{name}: broken link -> {target}")

        for ref in SKILL_REF_RE.findall(text):
            all_refs.add(ref[1:])

    for ref in sorted(all_refs):
        if ref not in dir_names:
            errors.append(f"unresolved skill reference: ${ref}")

    dup_path = os.path.join(root, "_shared", "duplication-manifest.json")
    if os.path.isfile(dup_path):
        dup = json.load(open(dup_path, encoding="utf-8"))
        for mirror in dup.get("mirrors", []):
            canonical = os.path.join(root, mirror["canonical"])
            mirror_dir = os.path.join(root, mirror["mirror"])
            allowed = set(mirror.get("allowed_extra_in_mirror", []))
            if not os.path.isdir(canonical) or not os.path.isdir(mirror_dir):
                errors.append(f"mirror missing tree: {mirror['id']}")
                continue
            canon_files = relative_files(canonical)
            mirror_files = set(relative_files(mirror_dir))
            for rel in canon_files:
                top = rel.split(os.sep, 1)[0]
                if top in allowed:
                    continue
                if rel not in mirror_files:
                    errors.append(f"mirror {mirror['id']}: missing {rel}")
                    continue
                mirror_rel = os.path.join(mirror_dir, rel)
                if open(os.path.join(canonical, rel), "rb").read() != open(mirror_rel, "rb").read():
                    errors.append(f"mirror {mirror['id']}: content drift at {rel}")
    else:
        warnings.append("no _shared/duplication-manifest.json")

    for warning in warnings:
        print(f"WARN  {warning}")
    for error in errors:
        print(f"ERROR {error}")
    print(f"\n{len(skill_dirs)} skills checked, {len(errors)} errors, {len(warnings)} warnings")
    if errors or (args.strict and warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
