/**
 * @fileoverview Version 4.3 - Per-Sheet Caching + Explicit Range Optimization
 * This script serves as an API with four endpoints:
 * 1. ?type=roster   -> Returns personnel roster (Cached)
 * 2. ?type=list     -> Returns list of available sheet names for next 14 days
 * 3. ?type=sheet&name=X&date=Y -> Returns a single sheet (shared cache with batch)
 * 4. ?type=batch    -> Returns ALL sheets in ONE request (per-sheet caching)
 *
 * v4.3 changes:
 * - Explicit getRange() reads only CONFIG-defined area (~8,580 cells vs ~422,910 from getDataRange)
 * - Per-sheet caching in batch endpoint (~40KB each, fits 100KB CacheService limit per key)
 * - Cold batch load ~30s, cached load <1s
 */

// --- CONFIGURATION ---

const CONFIG = {
  spreadsheetId: "1m5-6FxgCpgjlbcYYXlFMXrJ0sgyBPFwql9sG7WDI1MU",
  timezone: "America/Los_Angeles",
  rosterSheetName: 'Data v3',
  cacheDuration: 21600, // 30 minutes. Max allowed is 6 hours (21600 seconds).

  rosterStructure: [
    { header: 'FTC-B Students', category: 'FTC-B', col: 0 },
    { header: 'STC-B Students', category: 'STC-B', col: 1 },
    { header: 'FTC-A Students', category: 'FTC-A', col: 2 },
    { header: 'STC-A Students', category: 'STC-A', col: 3 },
    { header: 'Staff IP', category: 'Staff IP', col: 4 },
    { header: 'Staff IFTE/IWSO', category: 'Staff IFTE/ICSO', col: 5 },
    { header: 'Staff STC', category: 'Staff STC', col: 6 },
    { header: 'Attached/Support', category: 'Attached/Support', col: 7 },
    { header: 'Future Category 1', category: 'Future Category 1', col: 8 },
    { header: 'Future Category 2', category: 'Future Category 2', col: 9 }
  ],

  structureChangeoverDate: '2026-01-19',

  sheetStructures: {
    legacy: {
      sections: {
        supervision: { startRow: 2, endRow: 11, startCol: 0, endCol: 14 },
        flying:      { startRow: 12, endRow: 134, startCol: 0, endCol: 18 },
        ground:      { startRow: 135, endRow: 237, startCol: 0, endCol: 13 },
        na:          { startRow: 238, endRow: 340, startCol: 0, endCol: 11 }
      }
    },
    current: {
      sections: {
        supervision: { startRow: 2, endRow: 11, startCol: 0, endCol: 14 },
        flying:      { startRow: 13, endRow: 94, startCol: 0, endCol: 18 },
        ground:      { startRow: 96, endRow: 157, startCol: 0, endCol: 17 },
        na:          { startRow: 159, endRow: 220, startCol: 0, endCol: 14 },
        academics:   { startRow: 7, endRow: 11, startCol: 15, endCol: 18 }
      },
      personnelNoteStructure: {
        ranges: [
          { startRow: 227, endRow: 328, startCol: 0, endCol: 4, nameCol: 0, noteCol: 3 },
          { startRow: 227, endRow: 328, startCol: 4, endCol: 8, nameCol: 0, noteCol: 3 },
          { startRow: 227, endRow: 328, startCol: 8, endCol: 12, nameCol: 0, noteCol: 3 },
          { startRow: 227, endRow: 328, startCol: 12, endCol: 16, nameCol: 0, noteCol: 3},
          { startRow: 227, endRow: 328, startCol: 16, endCol: 20, nameCol: 0, noteCol: 3},
          { startRow: 328, endRow: 429, startCol: 0, endCol: 4, nameCol: 0, noteCol: 3 },
          { startRow: 328, endRow: 429, startCol: 4, endCol: 8, nameCol: 0, noteCol: 3 },
          { startRow: 328, endRow: 429, startCol: 8, endCol: 12, nameCol: 0, noteCol: 3 },
          { startRow: 328, endRow: 429, startCol: 12, endCol: 16, nameCol: 0, noteCol: 3},
          { startRow: 328, endRow: 429, startCol: 16, endCol: 20, nameCol: 0, noteCol: 3}
        ]
      }
    }
  }
};


// --- WEB APP ROUTER ---

function doGet(e) {
  const params = e.parameter;
  const type = params.type || 'list';

  try {
    if (type === 'roster') {
      return handleRosterRequest();
    } else if (type === 'list') {
      return handleManifestRequest();
    } else if (type === 'sheet') {
      if (!params.name || !params.date) throw new Error("Missing 'name' or 'date' parameter for sheet request.");
      return handleSheetRequest(params.name, params.date, params.refresh === 'true');
    } else if (type === 'batch') {
      return handleBatchRequest(params.refresh === 'true');
    } else {
      throw new Error("Unknown request type: " + type);
    }
  } catch (error) {
    console.error("doGet Error: " + error.toString() + "\n" + error.stack);
    return createJsonResponse({ error: true, message: error.toString() });
  }
}


// --- REQUEST HANDLERS ---

function handleRosterRequest() {
  const cache = CacheService.getScriptCache();
  const cachedRoster = cache.get("roster_v1");

  if (cachedRoster) {
    return createJsonResponse(JSON.parse(cachedRoster));
  }

  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const { rosterData } = getRoster(spreadsheet);

  const response = {
    metadata: {
      "current-as-of": new Date().toISOString()
    },
    roster: rosterData
  };

  cache.put("roster_v1", JSON.stringify(response), CONFIG.cacheDuration);
  return createJsonResponse(response);
}

function handleManifestRequest() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const availableSheets = findAvailableSheets(spreadsheet);

  return createJsonResponse({ sheets: availableSheets });
}

function handleSheetRequest(sheetName, isoDate, forceRefresh) {
  const sheetCacheKey = 'sheet_' + isoDate;
  const cache = CacheService.getScriptCache();

  // Check shared per-sheet cache (same keys as batch endpoint)
  if (!forceRefresh) {
    const cached = cache.get(sheetCacheKey);
    if (cached) {
      const dayEntry = JSON.parse(cached);
      return createJsonResponse({
        metadata: {
          "current-as-of": new Date().toISOString(),
          sourceSheet: { name: sheetName, date: isoDate, structureUsed: dayEntry.structureUsed },
          cacheStatus: "hit"
        },
        schedule: { data: dayEntry.data }
      });
    }
  }

  // Cache miss — fetch using the optimized explicit-range approach
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheetData = fetchSheetDataOptimized(spreadsheet, sheetName, isoDate);

  const dayEntry = {
    name: sheetName,
    isoDate: isoDate,
    structureUsed: sheetData.structureUsed,
    data: sheetData.data
  };

  // Write to shared cache (batch endpoint reads the same keys)
  try {
    cache.put(sheetCacheKey, JSON.stringify(dayEntry), CONFIG.cacheDuration);
  } catch (cacheErr) {
    console.error('Cache write failed for ' + sheetName + ': ' + cacheErr.toString());
  }

  return createJsonResponse({
    metadata: {
      "current-as-of": new Date().toISOString(),
      sourceSheet: { name: sheetName, date: isoDate, structureUsed: sheetData.structureUsed },
      cacheStatus: "miss"
    },
    schedule: { data: sheetData.data }
  });
}

/**
 * Batch endpoint - fetches all sheets in one execution with per-sheet caching.
 * Each sheet (~40KB) is cached individually under the 100KB CacheService limit.
 * Cold load ~30s, cached load <1s.
 */
function handleBatchRequest(forceRefresh) {
  const startTime = new Date();
  const cache = CacheService.getScriptCache();

  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const availableSheets = findAvailableSheets(spreadsheet);

  if (!availableSheets || availableSheets.length === 0) {
    throw new Error('No sheets found for the next 14 days');
  }

  const allDays = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  availableSheets.forEach((sheetInfo, index) => {
    const sheetCacheKey = 'sheet_' + sheetInfo.isoDate;

    // Check per-sheet cache (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get(sheetCacheKey);
      if (cached) {
        allDays.push(JSON.parse(cached));
        cacheHits++;
        return;
      }
    }

    // Cache miss — fetch this sheet
    cacheMisses++;
    const sheetStartTime = new Date();
    console.log(`Fetching sheet ${index + 1}/${availableSheets.length}: ${sheetInfo.name}`);

    try {
      const sheetData = fetchSheetDataOptimized(spreadsheet, sheetInfo.name, sheetInfo.isoDate);

      const dayEntry = {
        name: sheetInfo.name,
        isoDate: sheetInfo.isoDate,
        structureUsed: sheetData.structureUsed,
        data: sheetData.data
      };

      allDays.push(dayEntry);

      // Cache this sheet individually (~40KB each, well under 100KB limit)
      try {
        cache.put(sheetCacheKey, JSON.stringify(dayEntry), CONFIG.cacheDuration);
      } catch (cacheErr) {
        console.error('Cache write failed for ' + sheetInfo.name + ': ' + cacheErr.toString());
      }

      const sheetDuration = (new Date() - sheetStartTime) / 1000;
      console.log(`  Completed in ${sheetDuration.toFixed(2)}s`);

    } catch (error) {
      console.error(`  Error processing sheet ${sheetInfo.name}: ${error.toString()}`);
    }
  });

  const totalDuration = (new Date() - startTime) / 1000;
  console.log(`Batch complete: ${allDays.length} sheets (${cacheHits} cached, ${cacheMisses} fetched) in ${totalDuration.toFixed(2)}s`);

  const response = {
    metadata: {
      "current-as-of": new Date().toISOString(),
      daysIncluded: allDays.length,
      cacheStatus: cacheMisses === 0 ? "hit" : cacheHits === 0 ? "miss" : "partial",
      cacheHits: cacheHits,
      cacheMisses: cacheMisses,
      processingTime: `${totalDuration.toFixed(2)}s`
    },
    days: allDays
  };

  return createJsonResponse(response);
}


// --- DATA FETCHING ---

/**
 * Fetches a single sheet's data using explicit range from CONFIG.
 * Reads only the needed area (~8,580 cells) instead of getDataRange (~422,910 cells).
 */
function fetchSheetDataOptimized(spreadsheet, sheetName, isoDate) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found.`);

  const activeStructure = getActiveSheetStructure(isoDate);

  // Calculate the exact bounding box from CONFIG (not getDataRange which reads excess cells)
  let maxRow = 0, maxCol = 0;
  Object.values(activeStructure.sections).forEach(s => {
    maxRow = Math.max(maxRow, s.endRow);
    maxCol = Math.max(maxCol, s.endCol);
  });
  if (activeStructure.personnelNoteStructure && activeStructure.personnelNoteStructure.ranges) {
    activeStructure.personnelNoteStructure.ranges.forEach(r => {
      maxRow = Math.max(maxRow, r.endRow);
      maxCol = Math.max(maxCol, r.endCol);
    });
  }

  // Read only the needed area — avoids reading 98% excess cells from getDataRange()
  const allSheetData = sheet.getRange(1, 1, maxRow, maxCol).getDisplayValues();

  // Extract ranges from in-memory array (no additional API calls)
  const scheduleData = {};
  const sectionNames = Object.keys(activeStructure.sections);

  sectionNames.forEach(name => {
    const rangeDef = activeStructure.sections[name];
    scheduleData[name] = extractRange(allSheetData, rangeDef);
  });

  // Extract personnel notes if present
  if (activeStructure.personnelNoteStructure && activeStructure.personnelNoteStructure.ranges) {
    scheduleData.personnelNotes = activeStructure.personnelNoteStructure.ranges.map(rangeDef =>
      extractRange(allSheetData, rangeDef)
    );
  }

  return {
    structureUsed: (isoDate >= CONFIG.structureChangeoverDate) ? 'current' : 'legacy',
    data: scheduleData
  };
}

/**
 * Extract a range from a 2D array (in-memory operation, no API calls)
 */
function extractRange(allData, rangeDef) {
  const result = [];
  for (let row = rangeDef.startRow; row < rangeDef.endRow; row++) {
    const rowData = [];
    for (let col = rangeDef.startCol; col < rangeDef.endCol; col++) {
      rowData.push(allData[row] && allData[row][col] ? allData[row][col] : '');
    }
    result.push(rowData);
  }
  return result;
}


// --- SHARED DATA FETCHING ---

function getRoster(spreadsheet) {
  const rosterSheet = spreadsheet.getSheetByName(CONFIG.rosterSheetName);
  if (!rosterSheet) throw new Error(`Roster sheet "${CONFIG.rosterSheetName}" not found.`);

  const rosterData = {};
  const allRosterValues = rosterSheet.getDataRange().getDisplayValues();
  const headerNames = new Set(CONFIG.rosterStructure.map(c => c.header));

  CONFIG.rosterStructure.forEach(colConfig => {
    const names = allRosterValues.slice(1)
      .map(row => row[colConfig.col] ? row[colConfig.col].trim() : '')
      .filter(name => name && name.length > 1 && name !== '.' && !headerNames.has(name));

    names.sort((a, b) => a.localeCompare(b));
    rosterData[colConfig.category] = names;
  });

  return { rosterData };
}

// --- UTILITY FUNCTIONS ---

function findAvailableSheets(ss) {
  const foundSheets = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: CONFIG.timezone }));
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);

    const day = targetDate.getDate();
    const dayNameShort = targetDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: CONFIG.timezone });
    const monthName = targetDate.toLocaleDateString('en-US', { month: 'short', timeZone: CONFIG.timezone });
    const sheetName = `${dayNameShort} ${day} ${monthName}`;
    const sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, '0');
      const d = String(targetDate.getDate()).padStart(2, '0');

      foundSheets.push({
        name: sheet.getName(),
        isoDate: `${y}-${m}-${d}`
      });
    }
  }

  return (foundSheets.length > 0) ? foundSheets : null;
}

function getActiveSheetStructure(sheetDate) {
  return (sheetDate >= CONFIG.structureChangeoverDate)
    ? CONFIG.sheetStructures.current
    : CONFIG.sheetStructures.legacy;
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column >= 0) {
    temp = column % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp) / 26 - 1;
  }
  return letter;
}

function rangeToA1(r) {
  return `${columnToLetter(r.startCol)}${r.startRow + 1}:${columnToLetter(r.endCol - 1)}${r.endRow}`;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
