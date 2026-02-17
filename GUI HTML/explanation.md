# Column Slice Analysis — index.html Parsers vs output-sheet.json

## The Core Issue: JavaScript `slice()` is END-EXCLUSIVE

```javascript
array.slice(start, end)  // returns indices start ... end-1  (end is NOT included)
```

This means:
- `slice(6, 13)` returns indices **6, 7, 8, 9, 10, 11, 12** (7 items — index 13 is excluded)
- `slice(3, 12)` returns indices **3, 4, 5, 6, 7, 8, 9, 10, 11** (9 items — index 12 is excluded)

---

## FLYING — 18 columns (indices 0-17)

### Header row from output-sheet.json (line 159):
```
row[0]  = "Model"
row[1]  = "Brief Start"
row[2]  = "ETD"
row[3]  = "ETA"
row[4]  = "Debrief End"
row[5]  = "Event"
row[6]  = "Crew"       ← first crew slot
row[7]  = ""
row[8]  = ""
row[9]  = ""
row[10] = ""
row[11] = ""
row[12] = ""
row[13] = ""           ← last crew slot
row[14] = "Notes"
row[15] = "Effective"
row[16] = "CX/Non-E"
row[17] = "Partially E"
```

### issues.txt says: "6-13 stops at the last person. 14 is notes."
That annotation is **correct** — crew fills indices 6 through 13 (8 slots).

### Current code: `row.slice(6, 13)`
- Gets indices: 6, 7, 8, 9, 10, 11, 12 → **7 items, MISSES index 13**

### Correct: `row.slice(6, 14)`
- Gets indices: 6, 7, 8, 9, 10, 11, 12, 13 → **8 items, all crew slots**

### Real data example — GLIDER flight (line 559):
```
row[6]  = "Sanders"
row[7]  = "Payne"
row[8]  = "Miller, E"
row[9]  = "Peterson, W"
row[10] = ""
row[11] = ""
row[12] = ""
row[13] = ""           ← empty here, but IS a crew slot
row[14] = ""           ← Notes
```
With 4 crew members, both `slice(6,13)` and `slice(6,14)` produce the same filtered result.
But if a flight ever has 8 crew, index 13 would be lost.

### Impact today: **Low** (no flights in this data use the 8th crew slot)
### Impact long-term: **Real** (structure allocates 8 crew columns)

---

## GROUND — 17 columns (indices 0-16)

### Header row from output-sheet.json (line 1781):
```
row[0]  = "Events"
row[1]  = "Start"
row[2]  = "End"
row[3]  = "Person(s)"  ← first person slot
row[4]  = ""
row[5]  = ""
row[6]  = ""
row[7]  = ""
row[8]  = ""
row[9]  = ""
row[10] = ""
row[11] = ""
row[12] = ""           ← last person slot
row[13] = "Notes"
row[14] = "Effective"
row[15] = "CX/Non-E"
row[16] = "Partially E"
```

### issues.txt says: "People 3-12, notes 13"
That annotation is **correct** — people fill indices 3 through 12 (10 slots).

### Current code: `row.slice(3, 12)`
- Gets indices: 3, 4, 5, 6, 7, 8, 9, 10, 11 → **9 items, MISSES index 12**

### Correct: `row.slice(3, 13)`
- Gets indices: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 → **10 items, all person slots**

### PROOF — "Aircraft Fam" event (line 1819):
```
row[0]  = "Aircraft Fam"
row[1]  = "09:00"
row[2]  = "10:00"
row[3]  = "Erb, R"
row[4]  = "Knoerr, S"
row[5]  = "Peterson, R"
row[6]  = "Morrison, J"
row[7]  = "Martinez, P"
row[8]  = "Pessolano, C"
row[9]  = "Oren, E"
row[10] = "Novack, R"
row[11] = "Rogers, H"
row[12] = "Orfitelli, N"   ← THIS PERSON IS DROPPED by slice(3, 12)
row[13] = ""               ← Notes (empty)
row[14] = "FALSE"          ← Effective
row[15] = "FALSE"          ← CX/Non-E
row[16] = "FALSE"          ← Partially E
```

**`slice(3, 12)` returns:** Erb, Knoerr, Peterson, Morrison, Martinez, Pessolano, Oren, Novack, Rogers
**Missing:** Orfitelli, N (index 12)

**`slice(3, 13)` returns:** Erb, Knoerr, Peterson, Morrison, Martinez, Pessolano, Oren, Novack, Rogers, **Orfitelli, N**

### Also: "LJ-25 Ground School" (line 1857):
```
row[3]  = "Hebmann"
row[4]  = "Ryan, J"
row[5]  = "Sternat, N"
row[6]  = "Pope, D"
row[7]-[10] = ""
row[11] = "Ricci"          ← captured by both (index 11 < 12)
row[12] = ""
```
Both slices capture Ricci here. No loss in this case.

### Impact today: **ACTIVE BUG — Orfitelli, N is missing from Aircraft Fam**

---

## NA — 14 columns (indices 0-13)

### Header row from output-sheet.json (line 2941):
```
row[0]  = "Reason"
row[1]  = "Start"
row[2]  = "End"
row[3]  = "Person(s)"  ← first person slot
row[4]  = ""
row[5]  = ""
row[6]  = ""
row[7]  = ""
row[8]  = ""
row[9]  = ""
row[10] = ""
row[11] = ""
row[12] = ""           ← last person slot
row[13] = "Notes"
```

No Effective/CX/Partially E columns — NAs have only 14 columns.

### Current code: `row.slice(3)` (no end bound)
- Gets indices: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, **13** → **includes Notes column**

### Line-by-line walkthrough of parseNA with real data:

Using "N/A FOI Academics" (line 3054):
```
row = ["N/A FOI Academics", "09:00", "11:00", "Echegaray", "Sisneroz, M", "Dawson, D", "Gacosta", "", "", "", "", "", "", ""]
```

```javascript
const parseNA = (data, date) => {
    if (!data) return [];                    // Guard: skip if no NA data
    const events = [];                       // Accumulator for parsed events
    data.forEach(row => {
        const reason = row[0];               // "N/A FOI Academics"
        const start = row[1];                // "09:00"
        if (!reason || !start || reason === 'Reason') return;
        // ↑ Skips empty rows and the header row

        const people = row.slice(3).filter(p => p && p.trim());
        // row.slice(3) → ["Echegaray","Sisneroz, M","Dawson, D","Gacosta","","","","","","","",""]
        //                  idx3        idx4           idx5        idx6     7-12(empty)          idx13=""
        // .filter(p => p && p.trim()) removes empty strings
        // Result: ["Echegaray", "Sisneroz, M", "Dawson, D", "Gacosta"]
        // ✓ In this case Notes (row[13]) is "" so it gets filtered out. No visible bug.

        people.forEach(person => {
            events.push({
                type: 'NA',
                title: reason,               // "N/A FOI Academics"
                start: start,                // "09:00"
                end: row[2],                 // "11:00"
                person: person.trim(),       // Each person gets their own event
                date: date,
                fullTitle: `NA: ${reason}`,  // "NA: N/A FOI Academics"
                notes: row[13]              // "" (empty)
            });
        });
    });
    return events;
};
```

### Why NAs appear to work fine:
In this day's data, **every NA entry has an empty Notes column (row[13] = "")**:
- "NA" / Major, K → row[13] = ""
- "NA" / Tegtmeier → row[13] = ""
- "Appt" / Hutcheson → row[13] = ""
- "Green Room" / Sick → row[13] = ""
- (all others: row[13] = "")

Because `row[13]` is always `""`, the `.filter(p => p && p.trim())` catches it. **No visible bug today.**

### When it WOULD break:
If an NA entry ever has a note — e.g., `row[13] = "Doctor appointment"` — that string would:
1. Pass the filter (non-empty, has content)
2. Be treated as a person name
3. Create a phantom event: "Doctor appointment" would appear on the Gantt chart as if it were a person assigned to that NA

### The safe fix: `row.slice(3, 13)` — explicitly excludes the Notes column
This matches the ground section pattern (10 person slots, indices 3-12) and is defensive.

### My recommendation: This is your call.
- `slice(3)` works today because notes happen to be empty
- `slice(3, 13)` is defensive and matches the actual column structure
- If you're confident NA notes will always be empty, `slice(3)` is fine

---

## ACADEMICS — 3 columns (indices 0-2)

### Data from output-sheet.json (line 3919):
```
row[0] = "Academics"  (header)
row[0] = "Alpha FTC"  → start: "14:00", end: "17:00"
row[0] = "Alpha STC"  → start: "08:00", end: "12:00"
row[0] = "Bravo FTC"  → start: "07:00", end: "11:30"
```

Note: **No Bravo STC, no staff entries** in this day's data.

### Current groupMap in code:
```javascript
const groupMap = {
    'Alpha FTC': 'FTC-A', 'Alpha STC': 'STC-A',
    'Bravo FTC': 'FTC-B', 'Bravo STC': 'STC-B',
    'IP': 'Staff IP', 'Staff STC': 'Staff STC',
    'IFTE/IWSO': 'Staff IFTE/ICSO'
};
```

### issues.txt says: "Only alpha and bravo classes need academics. Staff won't have academics in that section."

The staff entries ('IP', 'Staff STC', 'IFTE/IWSO') in the groupMap would incorrectly assign academic events to all staff members if those labels ever appeared in the data. The data confirms only Alpha/Bravo entries exist.

---

## Summary Table

| Section | Current slice | Gets indices | Correct slice | Gets indices | Bug? |
|---------|-------------|-------------|--------------|-------------|------|
| Flying crew | `slice(6, 13)` | 6-12 (7) | `slice(6, 14)` | 6-13 (8) | Latent (8th slot unused today) |
| Ground people | `slice(3, 12)` | 3-11 (9) | `slice(3, 13)` | 3-12 (10) | **ACTIVE — Orfitelli, N dropped** |
| NA people | `slice(3)` | 3-end | `slice(3, 13)` | 3-12 (10) | Latent (notes empty today) |
| Academics | N/A | N/A | N/A | N/A | Remove staff entries from groupMap |
