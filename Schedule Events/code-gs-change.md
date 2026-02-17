# Code.gs Changelog

## v4.3 — 2026-02-10

### Performance: Explicit Range Read (14.5s → 2.8s per sheet)
- `fetchSheetDataOptimized()` now uses `sheet.getRange(1, 1, maxRow, maxCol)` instead of `sheet.getDataRange()`
- `getDataRange()` was reading 422,910 cells (1665 x 254) due to stray data/formatting in the spreadsheet
- CONFIG only needs 8,580 cells (429 x 20) — 98% of the read was wasted
- Cold batch load: ~181s → ~30s for 9 sheets

### Caching: Per-Sheet Shared Cache
- Batch and sheet endpoints now share the same cache keys (`sheet_YYYY-MM-DD`)
- Each sheet is ~40KB, well under the 100KB CacheService per-key limit
- Old approach tried to cache the entire batch payload (325KB) in one key — silently failed every time
- `handleSheetRequest` now uses `fetchSheetDataOptimized()` instead of `getRangeList` (was 34.8s in profiling)

### Architecture: Batch as Cache Warmer
- **Trigger (every 20 min):** Calls `?type=batch` → fetches all sheets in one execution, caches each one
- **HTML (individual calls):** Calls `?type=sheet&name=X&date=Y` → hits per-sheet cache → instant response
- **Refresh button:** Calls `?type=batch&refresh=true` → re-fetches all sheets, re-warms cache
- Batch response metadata includes `cacheStatus` ("hit" / "miss" / "partial"), `cacheHits`, `cacheMisses`

### Cleanup
- Removed profiling endpoints (`?type=profile`, `?type=sheetprofile`) and their handler functions
- File reduced from ~797 lines to ~410 lines

### Cache Key Reference
| Key | Written by | Read by | TTL |
|-----|-----------|---------|-----|
| `sheet_YYYY-MM-DD` | batch, sheet | batch, sheet | 30 min |
| `roster_v1` | roster | roster | 30 min |

### Response Format — `?type=sheet`
```json
{
  "metadata": {
    "current-as-of": "ISO timestamp",
    "sourceSheet": { "name": "...", "date": "YYYY-MM-DD", "structureUsed": "current|legacy" },
    "cacheStatus": "hit|miss"
  },
  "schedule": { "data": { "supervision": [[]], "flying": [[]], ... } }
}
```

### Response Format — `?type=batch`
```json
{
  "metadata": {
    "current-as-of": "ISO timestamp",
    "daysIncluded": 9,
    "cacheStatus": "hit|miss|partial",
    "cacheHits": 9,
    "cacheMisses": 0,
    "processingTime": "0.52s"
  },
  "days": [
    { "name": "Tue 10 Feb", "isoDate": "2026-02-10", "structureUsed": "current", "data": { ... } }
  ]
}
```

---

## v4.2T — Previous version
- Added batch endpoint (`?type=batch`)
- Used `getDataRange().getDisplayValues()` (read entire sheet)
- Single-key batch caching (325KB payload exceeded 100KB limit — cache always missed)
