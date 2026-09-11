"""Trim index.css to line 7094, removing all old learn CSS blocks."""
import os, pathlib

css_path = pathlib.Path(__file__).parent.parent / "frontend" / "src" / "index.css"
lines = css_path.read_text(encoding="utf-8").splitlines()
# Keep only the first 7094 lines (0-indexed: 0..7093)
trimmed = "\n".join(lines[:7094]) + "\n"
css_path.write_text(trimmed, encoding="utf-8")
print(f"Trimmed to {len(lines[:7094])} lines. Original was {len(lines)} lines.")
