#!/usr/bin/env python3
"""
MCG PDF Image Extraction Script
================================
Extracts all embedded images and rendered figure pages from an MCG PDF.

Usage:
    python extract-pdf-images.py <pdf_path> <output_dir>

Example:
    python scripts/extract-pdf-images.py MCG-25B/MCG\ 25B.pdf MCG-25B/images

Requirements:
    pip install PyMuPDF Pillow

Output:
    <output_dir>/
        embedded/           - Raw embedded images from PDF
        pages/              - Full-page renders of pages containing figures
        image-manifest.json - Metadata for all extracted images
"""

import sys
import os
import json
import re
from pathlib import Path
from datetime import datetime

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: PyMuPDF not installed. Run: pip install PyMuPDF")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("WARNING: Pillow not installed. Image deduplication disabled. Run: pip install Pillow")
    Image = None


# Figure detection patterns - matches "Figure N:" or "Figure N." in text
FIGURE_PATTERN = re.compile(
    r'Figure\s+(\d+[A-Za-z]?)\s*[:.]\s*(.+?)(?:\n|$)',
    re.IGNORECASE
)

# Table detection patterns
TABLE_PATTERN = re.compile(
    r'Table\s+(\d+[A-Za-z]?)\s*[:.]\s*(.+?)(?:\n|$)',
    re.IGNORECASE
)

# Minimum image dimensions to filter out decorative elements (pixels)
MIN_WIDTH = 100
MIN_HEIGHT = 80
MIN_AREA = 15000  # width * height


def extract_embedded_images(doc, output_dir):
    """Extract all embedded images from the PDF."""
    embedded_dir = output_dir / "embedded"
    embedded_dir.mkdir(parents=True, exist_ok=True)

    images = []
    seen_xrefs = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)

        for img_idx, img_info in enumerate(image_list):
            xref = img_info[0]

            # Skip duplicate images (same image referenced on multiple pages)
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                base_image = doc.extract_image(xref)
                if not base_image:
                    continue

                width = base_image["width"]
                height = base_image["height"]
                ext = base_image["ext"]
                image_bytes = base_image["image"]

                # Filter out tiny decorative images
                if width < MIN_WIDTH or height < MIN_HEIGHT:
                    continue
                if width * height < MIN_AREA:
                    continue

                filename = f"page{page_num + 1:03d}_img{img_idx:02d}_{width}x{height}.{ext}"
                filepath = embedded_dir / filename

                with open(filepath, "wb") as f:
                    f.write(image_bytes)

                images.append({
                    "type": "embedded",
                    "file": f"embedded/{filename}",
                    "page": page_num + 1,
                    "xref": xref,
                    "width": width,
                    "height": height,
                    "format": ext,
                    "sizeBytes": len(image_bytes)
                })

            except Exception as e:
                print(f"  WARNING: Failed to extract image xref={xref} on page {page_num + 1}: {e}")

    return images


def find_figure_pages(doc):
    """Scan all pages for figure/table captions and return page numbers."""
    figure_pages = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")

        # Find figure captions
        for match in FIGURE_PATTERN.finditer(text):
            fig_num = match.group(1)
            fig_name = match.group(2).strip()
            figure_pages.append({
                "type": "figure",
                "number": fig_num,
                "name": fig_name,
                "page": page_num + 1
            })

        # Find table captions (tables with visual content are also valuable)
        for match in TABLE_PATTERN.finditer(text):
            tab_num = match.group(1)
            tab_name = match.group(2).strip()
            figure_pages.append({
                "type": "table",
                "number": tab_num,
                "name": tab_name,
                "page": page_num + 1
            })

    return figure_pages


def render_figure_pages(doc, figure_pages, output_dir, dpi=200):
    """Render full-page images for pages that contain figures."""
    pages_dir = output_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    rendered = []
    rendered_pages = set()

    for fig in figure_pages:
        page_num = fig["page"] - 1  # 0-indexed

        # Don't render the same page twice
        if page_num in rendered_pages:
            # Still record the figure reference
            for r in rendered:
                if r["page"] == fig["page"]:
                    r["figures"].append({
                        "type": fig["type"],
                        "number": fig["number"],
                        "name": fig["name"]
                    })
            continue

        rendered_pages.add(page_num)

        page = doc[page_num]
        zoom = dpi / 72  # 72 is default PDF DPI
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)

        # Name file by figure type and number
        fig_type = fig["type"]
        fig_num = fig["number"]
        safe_name = re.sub(r'[^\w\s-]', '', fig["name"]).strip().replace(' ', '-')[:50]
        filename = f"page{fig['page']:03d}_{fig_type}-{fig_num}_{safe_name}.png"
        filepath = pages_dir / filename

        pix.save(str(filepath))

        rendered.append({
            "file": f"pages/{filename}",
            "page": fig["page"],
            "width": pix.width,
            "height": pix.height,
            "dpi": dpi,
            "figures": [{
                "type": fig["type"],
                "number": fig["number"],
                "name": fig["name"]
            }]
        })

    return rendered


def build_manifest(embedded_images, figure_pages, rendered_pages, pdf_path):
    """Build the image manifest JSON."""
    return {
        "sourceDocument": os.path.basename(pdf_path),
        "extractedAt": datetime.now().isoformat(),
        "stats": {
            "totalEmbeddedImages": len(embedded_images),
            "totalFigureCaptions": len([f for f in figure_pages if f["type"] == "figure"]),
            "totalTableCaptions": len([f for f in figure_pages if f["type"] == "table"]),
            "totalRenderedPages": len(rendered_pages)
        },
        "figureCaptions": figure_pages,
        "embeddedImages": embedded_images,
        "renderedPages": rendered_pages
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python extract-pdf-images.py <pdf_path> <output_dir>")
        print("Example: python scripts/extract-pdf-images.py MCG-25B/'MCG 25B.pdf' MCG-25B/images")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])

    if not pdf_path.exists():
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Opening PDF: {pdf_path}")
    doc = fitz.open(str(pdf_path))
    print(f"  Pages: {len(doc)}")

    # Step 1: Find all figure/table captions
    print("\nStep 1: Scanning for figure and table captions...")
    figure_pages = find_figure_pages(doc)
    fig_count = len([f for f in figure_pages if f["type"] == "figure"])
    tab_count = len([f for f in figure_pages if f["type"] == "table"])
    print(f"  Found {fig_count} figures and {tab_count} tables")
    for fig in figure_pages:
        print(f"    Page {fig['page']}: {fig['type'].title()} {fig['number']} - {fig['name']}")

    # Step 2: Extract embedded images
    print("\nStep 2: Extracting embedded images...")
    embedded_images = extract_embedded_images(doc, output_dir)
    print(f"  Extracted {len(embedded_images)} images (filtered by size >= {MIN_WIDTH}x{MIN_HEIGHT})")

    # Step 3: Render figure pages at high DPI
    print("\nStep 3: Rendering figure pages at 200 DPI...")
    rendered_pages = render_figure_pages(doc, figure_pages, output_dir, dpi=200)
    print(f"  Rendered {len(rendered_pages)} pages")

    # Step 4: Write manifest
    manifest = build_manifest(embedded_images, figure_pages, rendered_pages, str(pdf_path))
    manifest_path = output_dir / "image-manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"\nManifest written to: {manifest_path}")

    # Summary
    print(f"\n{'='*50}")
    print(f"Extraction complete!")
    print(f"  Embedded images: {len(embedded_images)}")
    print(f"  Figure captions: {fig_count}")
    print(f"  Table captions:  {tab_count}")
    print(f"  Rendered pages:  {len(rendered_pages)}")
    print(f"  Output dir:      {output_dir}")

    doc.close()


if __name__ == "__main__":
    main()
