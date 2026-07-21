#!/usr/bin/env python3
"""Decompress a Valve .dem.bz2 replay and validate its bzip2 stream."""

from __future__ import annotations

import argparse
import bz2
import shutil
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the .dem.bz2 replay")
    parser.add_argument("output", type=Path, nargs="?", help="Output .dem path")
    return parser.parse_args()


def decompress(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with bz2.open(source, "rb") as compressed, output.open("wb") as replay:
        shutil.copyfileobj(compressed, replay, length=1024 * 1024)


def main() -> None:
    args = parse_args()
    source = args.source.resolve(strict=True)
    output = args.output.resolve() if args.output else source.with_suffix("")
    decompress(source, output)
    print(f"Decompressed {source.stat().st_size} bytes to {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
