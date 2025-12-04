#!/usr/bin/env python3
"""
App Icon Generator for Gary AI iOS App
Generates a 1024x1024 app icon from the source logo.

Usage:
    pip install Pillow
    python generate_app_icon.py

This will create icon-1024.png in the Assets.xcassets/AppIcon.appiconset folder.
"""

from PIL import Image, ImageDraw
import os

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_IMAGE = os.path.join(SCRIPT_DIR, "../../gary2.0/src/assets/images/Garyemblem.png")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "Assets.xcassets/AppIcon.appiconset")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "icon-1024.png")

# App icon specs
ICON_SIZE = 1024
BACKGROUND_COLOR = (17, 17, 17)  # Near black (#111111) to match app theme
# Alternative: BACKGROUND_COLOR = (0, 0, 0)  # Pure black

def create_app_icon():
    """Create the app icon with solid background."""
    
    # Load source image
    print(f"Loading source image: {SOURCE_IMAGE}")
    if not os.path.exists(SOURCE_IMAGE):
        print(f"Error: Source image not found at {SOURCE_IMAGE}")
        print("Available Gary images:")
        images_dir = os.path.join(SCRIPT_DIR, "../../gary2.0/src/assets/images")
        if os.path.exists(images_dir):
            for f in os.listdir(images_dir):
                if 'gary' in f.lower() or 'Gary' in f:
                    print(f"  - {f}")
        return False
    
    source = Image.open(SOURCE_IMAGE).convert("RGBA")
    print(f"Source image size: {source.size}")
    
    # Create new image with solid background
    icon = Image.new("RGB", (ICON_SIZE, ICON_SIZE), BACKGROUND_COLOR)
    
    # Calculate padding (10% on each side for breathing room)
    padding = int(ICON_SIZE * 0.08)
    available_size = ICON_SIZE - (padding * 2)
    
    # Resize source to fit
    source_ratio = min(available_size / source.width, available_size / source.height)
    new_width = int(source.width * source_ratio)
    new_height = int(source.height * source_ratio)
    
    source_resized = source.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Center the logo
    x_offset = (ICON_SIZE - new_width) // 2
    y_offset = (ICON_SIZE - new_height) // 2
    
    # Paste with transparency mask
    icon.paste(source_resized, (x_offset, y_offset), source_resized)
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Save
    icon.save(OUTPUT_FILE, "PNG", quality=100)
    print(f"✓ Created app icon: {OUTPUT_FILE}")
    
    # Also create a preview at smaller size
    preview = icon.resize((180, 180), Image.Resampling.LANCZOS)
    preview_file = os.path.join(OUTPUT_DIR, "preview-180.png")
    preview.save(preview_file, "PNG")
    print(f"✓ Created preview: {preview_file}")
    
    return True

def main():
    print("=" * 50)
    print("Gary AI App Icon Generator")
    print("=" * 50)
    
    success = create_app_icon()
    
    if success:
        print("\n✓ App icon generated successfully!")
        print("\nNext steps:")
        print("1. Open Xcode")
        print("2. Navigate to Assets.xcassets > AppIcon")
        print("3. The icon should now appear")
        print("4. Build and run to verify")
    else:
        print("\n✗ Failed to generate app icon")
        print("\nManual steps:")
        print("1. Find or create a 1024x1024 PNG image")
        print("2. Name it 'icon-1024.png'")
        print("3. Place it in: Assets.xcassets/AppIcon.appiconset/")

if __name__ == "__main__":
    main()

