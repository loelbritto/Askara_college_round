"""Regenerate the extension's simple, locally drawn app mark (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parents[1] / "icons"
destination.mkdir(exist_ok=True)
canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((8, 8, 504, 504), radius=140, fill="#2456c6")
draw.rounded_rectangle((98, 96, 414, 366), radius=76, outline="#f5f4ee", width=25)
draw.line((120, 345, 120, 416, 195, 366), fill="#f5f4ee", width=25, joint="curve")
draw.line((175, 231, 236, 290, 343, 180), fill="#c7ff85", width=32, joint="curve")
for size in (16, 32, 48, 128):
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(destination / f"icon{size}.png")
