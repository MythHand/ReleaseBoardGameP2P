#!/usr/bin/env python3
"""Exact PNG pixel comparison. Requires Pillow. Exit: match 0, different 1, unverified 2."""

import argparse
import json
import sys
from pathlib import Path


def output_paths(reference_path, actual_path, output_dir):
    destinations = [output_dir.resolve() / name for name in ("report.json", "diff.png", "overlay.png")]
    if {path.resolve() for path in destinations} & {reference_path.resolve(), actual_path.resolve()}:
        raise ValueError("Output would overwrite an original screenshot")
    return destinations


def compare(reference_path, actual_path, output_dir):
    from PIL import Image, ImageChops

    reference_path = reference_path.resolve()
    actual_path = actual_path.resolve()
    output_dir = output_dir.resolve()
    destinations = output_paths(reference_path, actual_path, output_dir)

    images = []
    for path in (reference_path, actual_path):
        with Image.open(path) as source:
            if source.format != "PNG" or getattr(source, "n_frames", 1) != 1:
                raise ValueError(f"Expected a single-frame PNG: {path}")
            if source.mode not in ("RGB", "RGBA", "P", "L", "LA", "1"):
                raise ValueError(f"Unsupported PNG mode for lossless RGBA comparison: {source.mode}")
            images.append(source.convert("RGBA"))

    reference, actual = images
    report = {
        "reference": str(reference_path),
        "implementation": str(actual_path),
        "reference_size": list(reference.size),
        "implementation_size": list(actual.size),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    if reference.size != actual.size:
        report.update(status="DIFFERENT", reason="image_dimensions")
        code = 1
    else:
        difference = ImageChops.difference(reference, actual)
        channels = difference.split()
        magnitude = channels[0]
        for channel in channels[1:]:
            magnitude = ImageChops.lighter(magnitude, channel)
        histogram = magnitude.histogram()
        total = reference.width * reference.height
        changed = total - histogram[0]
        mask = magnitude.point(lambda value: 255 if value else 0)
        diff = Image.new("RGB", reference.size, "black")
        diff.paste((255, 0, 80), mask=mask)
        overlay = Image.blend(reference, actual, 0.5)
        diff.save(destinations[1])
        overlay.save(destinations[2])
        report.update(
            status="DIFFERENT" if changed else "MATCH",
            changed_pixels=changed,
            total_pixels=total,
            changed_fraction=changed / total,
            max_channel_delta=max(i for i, count in enumerate(histogram) if count),
            bbox=magnitude.getbbox(),
            diff=str(destinations[1]),
            overlay=str(destinations[2]),
        )
        code = 1 if changed else 0
    destinations[0].write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return code, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("implementation", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        code, report = compare(args.reference, args.implementation, args.output_dir)
    except (ImportError, OSError, ValueError) as error:
        code, report = 2, {"status": "UNVERIFIED", "error": str(error)}
        try:
            destination = output_paths(args.reference, args.implementation, args.output_dir)[0]
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        except (OSError, ValueError) as save_error:
            report["report_save_error"] = str(save_error)
    print(json.dumps(report, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
