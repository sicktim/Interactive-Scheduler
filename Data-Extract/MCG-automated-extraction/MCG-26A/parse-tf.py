#!/usr/bin/env python3
"""Parse TF phase text into complete V1 JSON for MCG 26A."""
import re, json, sys
from collections import defaultdict

TYPE_MAP = {
    "A": ("Academic Lecture", "Academics"),
    "B": ("Asynchronous Content", "Academics"),
    "C": ("Control Room", "Operations"),
    "E": ("Exam/Assessment", "Academics"),
    "F": ("Flight", "Flying"),
    "G": ("Ground School", "Ground"),
    "H": ("Ground Training", "Ground"),
    "I": ("Ground Test", "Ground"),
    "L": ("Lab", "Lab"),
    "M": ("MIB", "Ground"),
    "O": ("Space Operation", "Operations"),
    "R": ("Written Report", "Academics"),
    "S": ("Simulator", "Simulation"),
    "W": ("Working Group", "Academics"),
    "Y": ("Oral Report", "Academics"),
    "Z": ("Debrief", "Ground"),
}

PARENT_COURSES = {
    "5": "TF 5000 Foundations",
    "6": "TF 6000 Plan, Execute, Analyze, Report, Special Subjects (PEARS)",
    "7": "TF 7000 Qualitative Evaluations",
    "8": "TF 8000 Test Management Project",
    "9": "TF 9000 Comprehensive Exams",
}

EVENT_RE = re.compile(r"^(TF \d{4}[A-Z])\s+(.+)$")
MODULE_RE = re.compile(r"^(TF \d{4})\s+(.+)$")
TLO_RE = re.compile(r"^TLO\s+(\d+)\.\s*(.+)$")
PREREQ_LINE_RE = re.compile(r"^([A-Z]{2} \d{4}[A-Z])\s+(.+)$")


def parse_applicability(raw_name):
    """Extract (P), (FTC), (ABM/FTE/STC) etc from end of event name."""
    m = re.search(r"\s*\(([^)]+)\)\s*$", raw_name)
    if not m:
        return raw_name, []

    parens = m.group(1)
    known = {"P", "FTE", "CSO", "ABM", "RPA", "STC", "FTC", "US Only"}

    # Check if it looks like applicability vs descriptive
    descriptive_words = ["observe", "execute", "optional", "select", "non-crew",
                         "crew solo", "data group", "required", "all"]
    lower_parens = parens.lower()
    for dw in descriptive_words:
        if dw in lower_parens:
            return raw_name, []

    tokens = []
    # Handle "US Only STC" and similar compound entries
    if "US Only" in parens:
        tokens.append("US Only")
        parens = parens.replace("US Only", "").strip()
        if parens.startswith(","):
            parens = parens[1:].strip()

    parts = re.split(r"[/,]", parens)
    for p in parts:
        p = p.strip()
        if p in known:
            tokens.append(p)

    if tokens:
        return raw_name[:m.start()].strip(), tokens
    return raw_name, []


def parse_prereq_notes(text):
    """Extract [bracket notes] from prerequisite text."""
    bracket = re.search(r"\[([^\]]+)\]", text)
    if bracket:
        notes = bracket.group(0)
        name = text[:bracket.start()].strip()
        return name, notes
    return text.strip(), None


def main():
    base = "C:/Users/sickt/OneDrive/Documents/Claude/tps_schedule_gannt/Data-Extract/MCG-automated-extraction/MCG-26A"

    with open(f"{base}/text-extracts/phase-TF-text.txt", "r", encoding="utf-8") as f:
        text = f.read()

    lines = text.split("\n")
    modules = []

    # State
    cur_module = None
    cur_tlos = []
    cur_events = []
    cur_group = []       # events sharing desc/prereqs
    desc_lines = []
    prereq_list = []
    in_prereqs = False
    in_tlos = False
    past_intro = False   # skip pages before first module
    seen_codes = set()   # dedup: track extracted event codes

    def flush_group():
        """Finalize current event group with shared desc+prereqs."""
        nonlocal cur_group, desc_lines, prereq_list
        if not cur_group:
            return
        desc = " ".join(desc_lines).strip()
        for ev in cur_group:
            ev["description"] = desc
            ev["prerequisites"] = [dict(p) for p in prereq_list]
        cur_events.extend(cur_group)
        cur_group = []
        desc_lines = []
        prereq_list = []

    def flush_module():
        """Save current module."""
        nonlocal cur_module, cur_tlos, cur_events
        if not cur_module:
            return
        flush_group()
        modules.append({
            "moduleCode": cur_module["code"],
            "moduleName": cur_module["name"],
            "parentCourse": PARENT_COURSES.get(cur_module["code"][3], ""),
            "tlos": list(cur_tlos),
            "events": list(cur_events),
        })
        cur_module = None
        cur_tlos = []
        cur_events = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        # Skip page markers, page numbers
        if re.match(r"^===== PAGE \d+ =====$", line):
            continue
        if re.match(r"^\d{1,3}\s*$", line):
            continue

        # Blank lines end prereq mode (blank line separates prereqs from next event)
        # But only if we've actually collected prereqs — blank line right after
        # "Prerequisites:" header is just formatting, not a separator.
        if line == "":
            if in_prereqs and cur_group and prereq_list:
                in_prereqs = False
                for ev in cur_group:
                    ev["prerequisites"] = [dict(p) for p in prereq_list]
                cur_events.extend(cur_group)
                cur_group = []
                prereq_list = []
                desc_lines = []
            continue
        # Skip figure captions
        if re.match(r"^Figure \d+", line):
            continue
        # Skip semester credit hours
        if re.match(r"^\(\d", line) and "Semester Credit" in line:
            continue

        # Check for course header (TF 5000, TF 6000, etc)
        if re.match(r"^TF [5-9]000\s+", line):
            past_intro = True
            continue

        if not past_intro:
            continue

        # Check for module header (TF 5100, TF 6300, etc - not xxxxx0 events)
        if not EVENT_RE.match(line):
            mm = MODULE_RE.match(line)
            if mm and not mm.group(1).endswith("000"):
                flush_module()
                cur_module = {"code": mm.group(1), "name": mm.group(2).strip()}
                in_prereqs = False
                in_tlos = False
                continue

        if not cur_module:
            continue

        # TLO header
        if line.startswith("Terminal Learning Objectives"):
            in_tlos = True
            in_prereqs = False
            continue

        # Collect TLOs
        if in_tlos:
            tm = TLO_RE.match(line)
            if tm:
                cur_tlos.append(f"TLO {tm.group(1)}. {tm.group(2)}")
                continue
            elif line.startswith("TLO"):
                # Malformed TLO, append as-is
                cur_tlos.append(line)
                continue
            elif line.startswith("Upon completion") or line.startswith("During completion"):
                # Boilerplate between header and first TLO - skip but stay in TLO mode
                continue
            elif not EVENT_RE.match(line) and not line.startswith("Prerequisites"):
                # Continuation of previous TLO (or preamble text before first TLO)
                if cur_tlos:
                    cur_tlos[-1] += " " + line
                # If no TLOs yet, just skip this line (it's preamble)
                continue
            else:
                in_tlos = False
                # Fall through

        # Check for event code (not inside prereqs)
        em = EVENT_RE.match(line)
        if em and not in_prereqs:
            code = em.group(1)
            raw_name = em.group(2).strip()
            etype = code[-1]

            # Skip stray prereq references orphaned by page breaks
            # (identifiable by "[req'd for" bracket notation)
            if "[req'd" in raw_name or "[req\u2019d" in raw_name:
                continue

            # Skip if we already extracted this event code (dedup)
            if code in seen_codes:
                continue

            # If we have description accumulated, flush the previous group
            if cur_group and desc_lines:
                flush_group()

            name, appl = parse_applicability(raw_name)
            type_name, section = TYPE_MAP.get(etype, ("Unknown", "Unknown"))

            seen_codes.add(code)
            cur_group.append({
                "code": code,
                "eventName": name,
                "eventType": etype,
                "eventTypeName": type_name,
                "section": section,
                "applicability": appl,
                "description": "",
                "prerequisites": [],
            })
            in_prereqs = False
            continue

        # Prerequisites header
        if line == "Prerequisites:":
            in_prereqs = True
            # Finalize description
            if cur_group:
                desc = " ".join(desc_lines).strip()
                for ev in cur_group:
                    ev["description"] = desc
                desc_lines = []
            prereq_list = []
            continue

        # Collect prerequisites
        if in_prereqs:
            pm = PREREQ_LINE_RE.match(line)
            if pm:
                pcode = pm.group(1)
                praw = pm.group(2).strip()
                pname, notes = parse_prereq_notes(praw)
                prereq_list.append({
                    "code": pcode,
                    "name": pname,
                    "requiredFor": None,
                    "notes": notes,
                })
                continue
            elif EVENT_RE.match(line) or MODULE_RE.match(line):
                # End of prereqs, new event or module
                in_prereqs = False
                for ev in cur_group:
                    ev["prerequisites"] = [dict(p) for p in prereq_list]
                cur_events.extend(cur_group)
                cur_group = []
                prereq_list = []
                desc_lines = []
                i -= 1  # reprocess this line
                continue
            else:
                # Might be continuation or end
                if line and not re.match(r"^[A-Z]", line):
                    # Lowercase continuation of prereq name
                    if prereq_list:
                        prereq_list[-1]["name"] += " " + line
                    continue
                else:
                    # End of prereqs
                    in_prereqs = False
                    for ev in cur_group:
                        ev["prerequisites"] = [dict(p) for p in prereq_list]
                    cur_events.extend(cur_group)
                    cur_group = []
                    prereq_list = []
                    desc_lines = []
                    # Don't reprocess - this is description text for next section
                    continue

        # Collect description text
        if cur_group and not in_prereqs:
            desc_lines.append(line)

    # Final flush
    flush_module()

    # Build summary
    total_events = sum(len(m["events"]) for m in modules)
    total_prereqs = sum(
        sum(len(e["prerequisites"]) for e in m["events"])
        for m in modules
    )
    by_type = defaultdict(int)
    for m in modules:
        for e in m["events"]:
            by_type[e["eventType"]] += 1

    output = {
        "phase": "TF",
        "phaseName": "Test Foundations",
        "sourceDocument": "MCG 26A",
        "extractedAt": "2026-02-26",
        "pageRange": {"start": 131, "end": 162},
        "modules": modules,
        "summary": {
            "totalModules": len(modules),
            "totalEvents": total_events,
            "totalPrerequisites": total_prereqs,
            "eventsByType": dict(sorted(by_type.items())),
        },
    }

    # Write to working location and package location
    pkg = "C:/Users/sickt/OneDrive/Documents/Claude/tps_schedule_gannt/Data-Extract/MCG-automated-extraction/MCG-extraction-package/26A"
    for path in [
        f"{base}/Version-1-raw-data/phase-TF.json",
        f"{pkg}/Version-1-raw-data/phase-TF.json",
    ]:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"Written: {path}")

    print(f"\nModules: {len(modules)}")
    print(f"Events: {total_events}")
    print(f"Prerequisites: {total_prereqs}")
    print(f"By type: {dict(sorted(by_type.items()))}")
    print()
    for m in modules:
        evts = len(m["events"])
        tlos = len(m["tlos"])
        print(f"  {m['moduleCode']} {m['moduleName']}: {evts} events, {tlos} TLOs")

    # Cross-check: find any event codes in source not in output
    all_output_codes = set()
    for m in modules:
        for e in m["events"]:
            all_output_codes.add(e["code"])

    all_source_codes = set(re.findall(r"TF \d{4}[A-Z]", text))
    # Filter to only definition codes (exclude prereq refs by checking context)
    missing = all_source_codes - all_output_codes
    if missing:
        print(f"\nWARNING: {len(missing)} codes in source not in output:")
        for c in sorted(missing):
            print(f"  {c}")


if __name__ == "__main__":
    main()
