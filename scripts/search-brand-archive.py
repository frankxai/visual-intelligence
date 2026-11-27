#!/usr/bin/env python3
"""Compare archived rasters locally. Files are read-only and ranks are proposals."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageOps

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


def fingerprint(path):
    with Image.open(path) as original:
        oriented = ImageOps.exif_transpose(original).convert("RGBA")
        pixels = oriented.tobytes()
        size = oriented.size
        background = Image.new("RGBA", size, (128, 128, 128, 255))
        rgb = np.asarray(Image.alpha_composite(background, oriented).convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    thumb = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    coeff = cv2.dct(thumb.astype(np.float32))[:8, :8]
    return {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "pixel_sha256": hashlib.sha256(f"{size[0]}x{size[1]}:RGBA:".encode() + pixels).hexdigest(),
        "phash": np.packbits(coeff > np.median(coeff)).tobytes().hex(),
        "width": size[0], "height": size[1], "bytes": path.stat().st_size,
    }, rgb


def descriptor(net, rgb):
    # Full frame and center crop retain both portrait composition and the central mark.
    h, w = rgb.shape[:2]
    m = min(h, w)
    views = (rgb, rgb[(h-m)//2:(h-m)//2+m, (w-m)//2:(w-m)//2+m])
    parts = []
    for view in views:
        sample = cv2.resize(view, (224, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        sample -= np.array([.485, .456, .406], dtype=np.float32)
        sample /= np.array([.229, .224, .225], dtype=np.float32)
        net.setInput(sample.transpose(2, 0, 1)[None])
        pooled = net.forward("squeezenet0_concat7")[0].mean(axis=(1, 2))
        parts.append(pooled / max(np.linalg.norm(pooled), 1e-12))
    features = np.concatenate(parts)
    return features / max(np.linalg.norm(features), 1e-12)


def run(args):
    model_hash = hashlib.sha256(args.model.read_bytes()).hexdigest()
    if model_hash != args.model_sha256:
        raise ValueError("Model checksum differs from the supplied pin")
    net = cv2.dnn.readNetFromONNX(str(args.model))
    cv2.setNumThreads(2)
    if args.ocr and not shutil.which("tesseract"):
        raise ValueError("--ocr requires Tesseract")
    rows, vectors, errors = [], [], []
    for folder in args.roots:
        for path in sorted(folder.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                continue
            key = f"{folder.name}/{path.relative_to(folder).as_posix()}"
            try:
                row, rgb = fingerprint(path)
                feature = descriptor(net, rgb)
                if args.ocr:
                    result = subprocess.run(["tesseract", str(path), "stdout", "--psm", "11"],
                                            capture_output=True, timeout=30, check=True)
                    row["ocr"] = " ".join(result.stdout.decode(errors="replace").split())
            except (OSError, ValueError, cv2.error, subprocess.SubprocessError) as error:
                errors.append({"source": key, "error": type(error).__name__})
                continue
            rows.append({"source": key, **row})
            vectors.append(feature)
    if not rows:
        raise ValueError("No decodable raster images")
    matrix = np.stack(vectors)
    for i, row in enumerate(rows):
        candidates = []
        for j, other in enumerate(rows):
            if i == j:
                continue
            distance = (int(row["phash"], 16) ^ int(other["phash"], 16)).bit_count()
            kind = "visual-neighbor"
            if row["pixel_sha256"] == other["pixel_sha256"]:
                kind = "identical-decoded-pixels"
            if row["sha256"] == other["sha256"]:
                kind = "identical-bytes"
            candidates.append({"source": other["source"], "relation": kind,
                               "cosine": round(float(matrix[i] @ matrix[j]), 6), "phash_distance": distance})
        row["neighbors"] = sorted(candidates, key=lambda v: (
            {"identical-bytes":0, "identical-decoded-pixels":1, "visual-neighbor":2}[v["relation"]],
            -v["cosine"], v["phash_distance"], v["source"]))[:args.neighbors]
    args.output.write_text(json.dumps({"model_sha256": model_hash, "embedding":
        "SqueezeNet 1.1 fire9 pooled, full frame + center, L2, 1024 dimensions",
        "records": rows, "errors": errors}, indent=2))
    if args.vectors:
        np.savez_compressed(args.vectors, sources=np.array([r["source"] for r in rows]), embeddings=matrix)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--vectors", type=Path)
    parser.add_argument("--neighbors", default=8, type=int)
    parser.add_argument("--ocr", action="store_true")
    options = parser.parse_args()
    if options.neighbors < 1 or any(not p.is_dir() for p in options.roots) or len({p.name for p in options.roots}) != len(options.roots):
        parser.error("Use distinct named source directories and a positive neighbor count")
    outputs = [options.output] + ([options.vectors] if options.vectors else [])
    if any(o.resolve().is_relative_to(r.resolve()) for o in outputs for r in options.roots):
        parser.error("Write reports and vectors outside the read-only source roots")
    if options.vectors and (options.vectors.suffix != ".npz" or options.vectors.resolve() == options.output.resolve()):
        parser.error("Supply a separate .npz output for vectors")
    run(options)
