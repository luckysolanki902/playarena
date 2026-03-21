from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/Users/luckysolanki/Desktop/vault/WebD/startup/mym/mym/public/fonts/Liquids.ttf"
OUTPUT_DIR = "/Users/luckysolanki/Desktop/wordle/apps/web/public"
TEXT = "spyllio"
GREEN = "#22c55e"  # pretty green

os.makedirs(OUTPUT_DIR, exist_ok=True)


def make_og(width=1200, height=630):
    """Open Graph image: 1200x630, dark bg, green text centered, Powered by Spyll below."""
    img = Image.new("RGBA", (width, height), (10, 10, 10, 255))
    draw = ImageDraw.Draw(img)

    # Main title "spyllio"
    font_size = 160
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), TEXT, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (width - tw) / 2 - bbox[0]
    y = (height - th) / 2 - bbox[1] - 30  # shift up a bit
    draw.text((x, y), TEXT, fill=GREEN, font=font)

    # "Powered by Spyll" subtitle
    sub_font_size = 36
    sub_font = ImageFont.truetype(FONT_PATH, sub_font_size)
    sub_text = "Powered by Spyll"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    stw = sub_bbox[2] - sub_bbox[0]
    sx = (width - stw) / 2 - sub_bbox[0]
    sy = y + th + 40
    SPYLL_PINK = (255, 89, 115)
    # Draw "Powered by " in muted gray, "Spyll" in pink
    powered_text = "Powered by "
    pb_bbox = draw.textbbox((0, 0), powered_text, font=sub_font)
    pw = pb_bbox[2] - pb_bbox[0]
    draw.text((sx, sy), powered_text, fill=(107, 122, 148), font=sub_font)
    draw.text((sx + pw, sy), "Spyll", fill=SPYLL_PINK, font=sub_font)

    img.convert("RGB").save(os.path.join(OUTPUT_DIR, "og.png"))
    print("Created og.png (1200x630)")


def make_favicon_sizes():
    """Generate favicon.ico (multi-size) + apple-touch-icon.png + favicon PNGs."""
    sizes = [16, 32, 48, 64, 128, 180, 192, 512]
    pngs = {}

    for sz in sizes:
        img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Use first letter 's' for small sizes, full text won't fit
        char = "s"
        font_size = int(sz * 0.75)
        font = ImageFont.truetype(FONT_PATH, font_size)
        bbox = draw.textbbox((0, 0), char, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (sz - tw) / 2 - bbox[0]
        y = (sz - th) / 2 - bbox[1]
        draw.text((x, y), char, fill=GREEN, font=font)
        pngs[sz] = img

    # favicon.ico with multiple sizes
    ico_sizes = [pngs[s] for s in [16, 32, 48]]
    ico_sizes[0].save(
        os.path.join(OUTPUT_DIR, "favicon.ico"),
        format="ICO",
        sizes=[(s, s) for s in [16, 32, 48]],
        append_images=ico_sizes[1:],
    )
    print("Created favicon.ico (16, 32, 48)")

    # Individual PNGs
    for sz in [16, 32, 192, 512]:
        name = f"favicon-{sz}x{sz}.png"
        pngs[sz].save(os.path.join(OUTPUT_DIR, name))
        print(f"Created {name}")

    # Apple touch icon (180x180)
    pngs[180].save(os.path.join(OUTPUT_DIR, "apple-touch-icon.png"))
    print("Created apple-touch-icon.png (180x180)")


if __name__ == "__main__":
    make_og()
    make_favicon_sizes()
    print("\nAll assets generated in", OUTPUT_DIR)
