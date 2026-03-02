#!/usr/bin/env python3
"""
MCG Figure Analysis Script (AI-Powered)
=========================================
Takes extracted images from extract-pdf-images.py and uses Claude API
to interpret them into structured JSON data.

Usage:
    python analyze-figures.py <images_dir> <output_path>

Example:
    python scripts/analyze-figures.py MCG-25B/images MCG-25B/figure-analysis.json

Requirements:
    pip install anthropic Pillow

Environment:
    ANTHROPIC_API_KEY must be set (or use Claude Code's built-in key)

How it works:
    1. Reads image-manifest.json from the images directory
    2. For each rendered figure page, sends the image to Claude with a
       specialized prompt based on the figure type
    3. Claude returns structured JSON describing the figure content
    4. Results are merged into a single figure-analysis.json

Figure types handled:
    - Course overview diagrams  -> course assignments, phase groupings
    - Dependency/flow diagrams  -> dependency edges between events
    - Event sequence diagrams   -> ordering constraints
    - Schedule timelines        -> time windows, phase boundaries
    - Tables                    -> tabular data extraction
    - Organizational charts     -> role/responsibility mappings
"""

import sys
import os
import json
import base64
import time
from pathlib import Path
from datetime import datetime

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic SDK not installed. Run: pip install anthropic")
    sys.exit(1)


# ─── Prompt Templates ─────────────────────────────────────────────

CLASSIFY_PROMPT = """You are analyzing a figure from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

Look at this image and classify it into ONE of these categories:
- course_overview: Shows the overall curriculum structure, course groupings, FTC/STC breakdown
- dependency_flow: Shows prerequisite chains, event dependencies, flow between events
- event_sequence: Shows the ordering of events within a phase or module
- schedule_timeline: Shows a timeline, Gantt-like view, or scheduling windows
- organizational: Shows org charts, role responsibilities, reporting chains
- reference_table: A table of data (event codes, hours, requirements, etc.)
- other: Doesn't fit the above categories

Respond with ONLY a JSON object:
{
  "figureType": "<category>",
  "confidence": <0.0-1.0>,
  "briefDescription": "<one sentence describing what the figure shows>"
}"""

COURSE_OVERVIEW_PROMPT = """You are analyzing a Course Overview figure from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

TPS has two main courses:
- FTC (Flight Test Course) - focuses on aircraft flight testing
- STC (Space Test Course) - focuses on space systems testing

Some curriculum is shared between both courses.

From this figure, extract:
1. Which phases/courses belong to FTC (typically shown on left or with specific styling)
2. Which phases/courses belong to STC (typically shown on right or with specific styling)
3. Which are shared (typically shown in center or with different styling)
4. The hierarchy: courses contain modules (e.g., "PF 5000 Performance Preliminaries")
5. Any visual groupings (e.g., "Flight Sciences" groups PF + FQ)

Visual cues:
- Dark/colored backgrounds often indicate course-specific phases
- Light/grey backgrounds often indicate shared phases
- Orange text is typically used for course/module codes

Respond with ONLY a JSON object:
{
  "description": "<what the figure shows>",
  "courseAssignments": [
    {"code": "CF", "name": "Check Flight Training", "assignment": "FTC", "visualCue": "<what indicates this>"},
    {"code": "SO", "name": "Space System Operations", "assignment": "STC", "visualCue": "<what indicates this>"}
  ],
  "phaseGroupings": [
    {"groupName": "Flight Sciences", "phases": ["PF", "FQ"], "assignment": "FTC"},
    {"groupName": "Astronautical Sciences", "phases": ["AS"], "assignment": "STC"}
  ],
  "moduleList": [
    {"phaseCode": "CF", "moduleCode": "CF 5000", "moduleName": "Common Ground Training"},
    {"phaseCode": "CF", "moduleCode": "CF 6000", "moduleName": "Flight Training"}
  ],
  "layoutDescription": "<describe the spatial layout and visual hierarchy>"
}"""

DEPENDENCY_FLOW_PROMPT = """You are analyzing a dependency/flow diagram from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

This figure shows how events or modules depend on each other. Extract all visible dependencies.

Event codes follow the pattern: XX NNNNL (e.g., CF 6351F, TF 5101A)
- XX = phase code (CF, TF, PF, FQ, SY, AS, SO, AN, TL)
- NNNN = numeric identifier
- L = event type letter (A=academic, F=flight, S=sim, etc.)

From this figure, extract:
1. All nodes (events or modules) shown
2. All directed edges (arrows/lines showing dependencies)
3. Any groupings, swim lanes, or phase boundaries
4. Annotations on the edges (conditions, position restrictions)

Respond with ONLY a JSON object:
{
  "description": "<what the figure shows>",
  "nodes": [
    {"code": "CF 5101H", "name": "Emergency Parachute Training", "group": "<phase or module>"}
  ],
  "edges": [
    {
      "from": "CF 5101H",
      "to": "CF 6351F",
      "type": "prerequisite",
      "label": "<any text on the arrow>",
      "conditions": "<position/scope restrictions if shown>"
    }
  ],
  "groups": [
    {"name": "Ground Training", "members": ["CF 5101H", "CF 5110H"]}
  ],
  "layoutDescription": "<describe the flow direction and groupings>"
}"""

EVENT_SEQUENCE_PROMPT = """You are analyzing an event sequence diagram from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

This figure shows the intended ordering of events, possibly with branching paths for different student types (FTC/STC, Pilot/FTE, etc.).

Extract:
1. The sequence of events shown
2. Any branching points (where paths diverge for different student types)
3. Any merge points (where paths converge)
4. Position/course annotations

Respond with ONLY a JSON object:
{
  "description": "<what the sequence shows>",
  "sequences": [
    {
      "name": "<sequence name or default>",
      "applicability": "<who follows this sequence: FTC, STC, all, P only, etc.>",
      "events": ["TF 5101A", "TF 5102A", "TF 5103L"],
      "isLinear": true
    }
  ],
  "branchPoints": [
    {
      "afterEvent": "TF 5201A",
      "branches": [
        {"condition": "FTC", "nextEvent": "TF 5301A"},
        {"condition": "STC", "nextEvent": "TF 5401A"}
      ]
    }
  ],
  "mergePoints": [
    {"atEvent": "TF 6101A", "fromBranches": ["FTC path", "STC path"]}
  ]
}"""

REFERENCE_TABLE_PROMPT = """You are analyzing a reference table from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

Extract the table contents as structured data. Identify:
1. Column headers
2. Row data
3. Any merged cells or hierarchical structure
4. Units for numeric columns (hours, days, etc.)

Event codes follow: XX NNNNL (e.g., CF 6351F)
Position codes: P (Pilot), FTE (Flight Test Engineer), CSO, ABM, RPA
Course types: FTC (Flight Test Course), STC (Space Test Course)

Respond with ONLY a JSON object:
{
  "description": "<what the table contains>",
  "headers": ["Column1", "Column2"],
  "rows": [
    {"Column1": "value", "Column2": "value"}
  ],
  "notes": "<any footnotes or special formatting observed>"
}"""

GENERIC_PROMPT = """You are analyzing a figure from a US Air Force Test Pilot School (TPS) Master Curriculum Guide (MCG).

Extract any structured information visible:
- Event codes (XX NNNNL format)
- Course assignments (FTC / STC / Shared)
- Dependencies or sequences between events
- Position applicability (P, FTE, CSO, ABM, RPA)
- Scheduling information (durations, windows, timelines)

Respond with ONLY a JSON object:
{
  "description": "<what the figure shows>",
  "extractedData": {
    "<key>": "<value>"
  },
  "dependencyEdges": [],
  "courseAssignments": [],
  "notes": "<anything noteworthy>"
}"""


PROMPT_MAP = {
    "course_overview": COURSE_OVERVIEW_PROMPT,
    "dependency_flow": DEPENDENCY_FLOW_PROMPT,
    "event_sequence": EVENT_SEQUENCE_PROMPT,
    "schedule_timeline": GENERIC_PROMPT,
    "organizational": GENERIC_PROMPT,
    "reference_table": REFERENCE_TABLE_PROMPT,
    "other": GENERIC_PROMPT,
}


# ─── API Helpers ──────────────────────────────────────────────────

def load_image_as_base64(image_path):
    """Load an image file and return base64-encoded data."""
    with open(image_path, "rb") as f:
        data = f.read()

    ext = image_path.suffix.lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "image/png")

    return base64.standard_b64encode(data).decode("utf-8"), media_type


def call_claude_vision(client, image_path, prompt, model="claude-sonnet-4-20250514"):
    """Send an image to Claude for analysis. Returns parsed JSON."""
    image_data, media_type = load_image_as_base64(image_path)

    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_data
                    }
                },
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }]
    )

    response_text = message.content[0].text.strip()

    # Try to parse JSON from response (handle markdown code blocks)
    if response_text.startswith("```"):
        # Strip markdown code fences
        lines = response_text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            if line.startswith("```"):
                in_block = not in_block
                continue
            if in_block:
                json_lines.append(line)
        response_text = "\n".join(json_lines)

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        # If JSON parsing fails, return the raw text wrapped in an object
        return {
            "error": "Failed to parse JSON response",
            "rawResponse": response_text
        }


# ─── Main Pipeline ────────────────────────────────────────────────

def analyze_single_figure(client, images_dir, rendered_page, figure_info):
    """Classify and analyze a single figure."""
    image_path = images_dir / rendered_page["file"]

    if not image_path.exists():
        return {
            "error": f"Image file not found: {image_path}",
            "figure": figure_info
        }

    fig_label = f"{figure_info['type'].title()} {figure_info['number']}: {figure_info['name']}"
    print(f"  Analyzing {fig_label}...")

    # Step 1: Classify the figure
    print(f"    Classifying...")
    classification = call_claude_vision(client, image_path, CLASSIFY_PROMPT)
    figure_type = classification.get("figureType", "other")
    confidence = classification.get("confidence", 0.5)
    print(f"    Type: {figure_type} (confidence: {confidence})")

    # Step 2: Analyze with type-specific prompt
    analysis_prompt = PROMPT_MAP.get(figure_type, GENERIC_PROMPT)
    print(f"    Interpreting ({figure_type})...")

    # Rate limiting - be gentle with the API
    time.sleep(1)

    interpretation = call_claude_vision(client, image_path, analysis_prompt)

    return {
        "figure": figure_info,
        "imageFile": rendered_page["file"],
        "page": rendered_page["page"],
        "classification": {
            "figureType": figure_type,
            "confidence": confidence,
            "briefDescription": classification.get("briefDescription", "")
        },
        "interpretation": interpretation
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python analyze-figures.py <images_dir> <output_path>")
        print("Example: python scripts/analyze-figures.py MCG-25B/images MCG-25B/figure-analysis.json")
        sys.exit(1)

    images_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    # Load manifest
    manifest_path = images_dir / "image-manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: image-manifest.json not found in {images_dir}")
        print("Run extract-pdf-images.py first.")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    rendered_pages = manifest.get("renderedPages", [])
    if not rendered_pages:
        print("No rendered figure pages found in manifest.")
        sys.exit(0)

    # Initialize Claude client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        print("Set it with: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Analyzing {len(rendered_pages)} rendered figure pages...")
    print(f"Source: {manifest['sourceDocument']}")
    print()

    results = []
    errors = []

    for rp in rendered_pages:
        for fig in rp.get("figures", []):
            try:
                result = analyze_single_figure(client, images_dir, rp, fig)
                results.append(result)
                time.sleep(2)  # Rate limiting between figures
            except Exception as e:
                error_msg = f"Failed to analyze {fig['type']} {fig['number']}: {e}"
                print(f"  ERROR: {error_msg}")
                errors.append({
                    "figure": fig,
                    "error": str(e)
                })

    # Build output
    output = {
        "sourceDocument": manifest["sourceDocument"],
        "analyzedAt": datetime.now().isoformat(),
        "stats": {
            "totalFiguresAnalyzed": len(results),
            "errors": len(errors),
            "byType": {}
        },
        "results": results,
        "errors": errors
    }

    # Count by type
    for r in results:
        ft = r.get("classification", {}).get("figureType", "unknown")
        output["stats"]["byType"][ft] = output["stats"]["byType"].get(ft, 0) + 1

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Analysis complete!")
    print(f"  Figures analyzed: {len(results)}")
    print(f"  Errors: {len(errors)}")
    print(f"  By type: {json.dumps(output['stats']['byType'], indent=4)}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
