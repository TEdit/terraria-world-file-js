/**
 * World Data Comparison Utility
 * Validates parsed world data for corruption or changes after save/reload cycles
 */

/**
 * Deep compare two world data objects
 * Returns detailed report of differences and validation status
 * @param {object} original - Original parsed world data
 * @param {object} reloaded - Reloaded parsed world data after save
 * @param {string} filename - Name of the test file (for reporting)
 * @returns {object} Comparison result with status, matches, and differences
 */
function compareWorldData(original, reloaded, filename = '') {
  const result = {
    filename,
    isValid: true,
    matches: {},
    differences: [],
    warnings: []
  };

  // Helper to record differences
  const addDifference = (field, originalValue, reloadedValue, severity = 'error') => {
    result.differences.push({
      field,
      original: originalValue,
      reloaded: reloadedValue,
      severity
    });
    if (severity === 'error') {
      result.isValid = false;
    }
  };

  // Helper to record warnings
  const addWarning = (field, message) => {
    result.warnings.push({ field, message });
  };

  // 1. VALIDATE FILE FORMAT HEADER
  if (!original.fileFormatHeader || !reloaded.fileFormatHeader) {
    addDifference('fileFormatHeader', original.fileFormatHeader ? 'exists' : 'missing', reloaded.fileFormatHeader ? 'exists' : 'missing');
    return result;
  }

  const fileFormatFields = ['version', 'magicNumber', 'fileType', 'revision', 'favorite'];
  fileFormatFields.forEach(field => {
    const origVal = original.fileFormatHeader[field];
    const reloadVal = reloaded.fileFormatHeader[field];
    
    if (origVal !== reloadVal) {
      addDifference(`fileFormatHeader.${field}`, origVal, reloadVal);
    } else {
      result.matches[`fileFormatHeader.${field}`] = true;
    }
  });

  // 2. VALIDATE POINTER OFFSETS (warn on changes, don't fail)
  if (original.fileFormatHeader.pointers && reloaded.fileFormatHeader.pointers) {
    const origPointers = original.fileFormatHeader.pointers;
    const reloadPointers = reloaded.fileFormatHeader.pointers;

    if (origPointers.length !== reloadPointers.length) {
      addWarning('pointers.length', `Changed from ${origPointers.length} to ${reloadPointers.length}`);
    }

    origPointers.forEach((ptr, idx) => {
      if (reloadPointers[idx] !== undefined && ptr !== reloadPointers[idx]) {
        addWarning(`pointers[${idx}]`, `Offset changed from ${ptr} to ${reloadPointers[idx]}`);
      }
    });

    if (result.warnings.filter(w => w.field.startsWith('pointers')).length === 0) {
      result.matches['fileFormatHeader.pointers'] = true;
    }
  }

  // 3. VALIDATE WORLD HEADER FIELDS
  if (!original.header || !reloaded.header) {
    addDifference('header', original.header ? 'exists' : 'missing', reloaded.header ? 'exists' : 'missing');
    return result;
  }

  const headerFields = [
    'mapName',
    'seedText',
    'worldGeneratorVersion',
    'guid',
    'worldID',
    'leftWorld',
    'rightWorld',
    'topWorld',
    'bottomWorld',
    'maxTilesX',
    'maxTilesY',
    'spawnX',
    'spawnY',
    'groundLevel',
    'rockLevel',
    'dayTime',
    'time',
    'raining',
    'rainCounter',
    'maxRain',
    'windSpeed'
  ];

  headerFields.forEach(field => {
    if (field in original.header) {
      const origVal = original.header[field];
      const reloadVal = reloaded.header[field];

      // Handle array/buffer comparisons (worldGeneratorVersion, guid, etc.)
      let isEqual;
      if (origVal instanceof Uint8Array && reloadVal instanceof Uint8Array) {
        isEqual = origVal.length === reloadVal.length &&
                  origVal.every((val, idx) => val === reloadVal[idx]);
      } else if (Array.isArray(origVal) && Array.isArray(reloadVal)) {
        isEqual = JSON.stringify(origVal) === JSON.stringify(reloadVal);
      } else {
        isEqual = origVal === reloadVal;
      }

      if (!isEqual) {
        addDifference(`header.${field}`, origVal, reloadVal);
      } else {
        result.matches[`header.${field}`] = true;
      }
    }
  });

  // 4. VALIDATE TILE GRID DIMENSIONS
  if (original.tiles && reloaded.tiles) {
    const origWidth = original.tiles.length;
    const origHeight = original.tiles[0] ? original.tiles[0].length : 0;
    const reloadWidth = reloaded.tiles.length;
    const reloadHeight = reloaded.tiles[0] ? reloaded.tiles[0].length : 0;

    if (origWidth !== reloadWidth || origHeight !== reloadHeight) {
      addDifference(
        'tiles.dimensions',
        `${origWidth}x${origHeight}`,
        `${reloadWidth}x${reloadHeight}`
      );
    } else {
      result.matches['tiles.dimensions'] = true;

      // Sample tile comparison: first, last, and center tiles
      const sampleTiles = [
        { x: 0, y: 0, name: 'first' },
        { x: origWidth - 1, y: origHeight - 1, name: 'last' },
        { x: Math.floor(origWidth / 2), y: Math.floor(origHeight / 2), name: 'center' }
      ];

      sampleTiles.forEach(sample => {
        const origTile = original.tiles[sample.x][sample.y];
        const reloadTile = reloaded.tiles[sample.x][sample.y];
        const tileKey = `tiles.${sample.name}[${sample.x},${sample.y}]`;

        if (JSON.stringify(origTile) !== JSON.stringify(reloadTile)) {
          addDifference(tileKey, origTile, reloadTile);
        } else {
          result.matches[tileKey] = true;
        }
      });
    }
  }

  // 5. VALIDATE ENTITY COUNTS
  const entities = [
    { key: 'chests', accessor: (w) => w.chests },
    { key: 'signs', accessor: (w) => w.signs },
    { key: 'NPCs', accessor: (w) => w.NPCs?.NPCs },
    { key: 'tileEntities', accessor: (w) => w.tileEntities }
  ];

  entities.forEach(entity => {
    const origArray = entity.accessor(original);
    const reloadArray = entity.accessor(reloaded);
    const origCount = Array.isArray(origArray) ? origArray.length : 0;
    const reloadCount = Array.isArray(reloadArray) ? reloadArray.length : 0;

    if (origCount !== reloadCount) {
      addDifference(`${entity.key}.length`, origCount, reloadCount);
    } else {
      result.matches[`${entity.key}.length`] = origCount;
    }
  });

  // 6. VALIDATE CHEST CONTENTS (if present)
  if (Array.isArray(original.chests) && Array.isArray(reloaded.chests) && original.chests.length > 0) {
    const chestSamples = [0, Math.floor(original.chests.length / 2), original.chests.length - 1];
    chestSamples.forEach(idx => {
      if (idx < original.chests.length && idx < reloaded.chests.length) {
        const origChest = original.chests[idx];
        const reloadChest = reloaded.chests[idx];
        const chestKey = `chest[${idx}]`;

        // Compare chest position and item count
        if (origChest.x !== reloadChest.x || origChest.y !== reloadChest.y) {
          addDifference(`${chestKey}.position`, 
            `(${origChest.x},${origChest.y})`, 
            `(${reloadChest.x},${reloadChest.y})`);
        }

        const origItemCount = origChest.items ? origChest.items.length : 0;
        const reloadItemCount = reloadChest.items ? reloadChest.items.length : 0;
        if (origItemCount !== reloadItemCount) {
          addDifference(`${chestKey}.items.length`, origItemCount, reloadItemCount);
        }
      }
    });
  }

  // 7. VALIDATE NPC DATA (if present)
  const origNPCs = original.NPCs?.NPCs;
  const reloadNPCs = reloaded.NPCs?.NPCs;
  if (Array.isArray(origNPCs) && Array.isArray(reloadNPCs) && origNPCs.length > 0) {
    const npcSamples = [0, Math.floor(origNPCs.length / 2), origNPCs.length - 1];
    npcSamples.forEach(idx => {
      if (idx < origNPCs.length && idx < reloadNPCs.length) {
        const origNpc = origNPCs[idx];
        const reloadNpc = reloadNPCs[idx];
        const npcKey = `NPC[${idx}]`;

        if (origNpc.id !== reloadNpc.id) {
          addDifference(`${npcKey}.id`, origNpc.id, reloadNpc.id);
        }
        if (origNpc.x !== reloadNpc.x || origNpc.y !== reloadNpc.y) {
          addDifference(`${npcKey}.position`, 
            `(${origNpc.x},${origNpc.y})`, 
            `(${reloadNpc.x},${reloadNpc.y})`);
        }
      }
    });
  }

  return result;
}

/**
 * Format comparison result for console output
 * @param {object} result - Comparison result from compareWorldData()
 * @returns {string} Formatted report
 */
function formatComparisonReport(result) {
  const status = result.isValid ? '✓ PASS' : '✗ FAIL';
  let output = `\n${status} - ${result.filename}\n`;

  if (result.differences.length > 0) {
    output += `  Differences (${result.differences.length}):\n`;
    result.differences.slice(0, 10).forEach(diff => {
      output += `    - ${diff.field}: ${JSON.stringify(diff.original)} → ${JSON.stringify(diff.reloaded)}\n`;
    });
    if (result.differences.length > 10) {
      output += `    ... and ${result.differences.length - 10} more\n`;
    }
  }

  if (result.warnings.length > 0) {
    output += `  Warnings (${result.warnings.length}):\n`;
    result.warnings.slice(0, 5).forEach(warn => {
      output += `    ⚠ ${warn.field}: ${warn.message}\n`;
    });
    if (result.warnings.length > 5) {
      output += `    ... and ${result.warnings.length - 5} more\n`;
    }
  }

  if (result.isValid && result.warnings.length === 0) {
    output += `  All validations passed (${Object.keys(result.matches).length} checks)\n`;
  }

  return output;
}

export { compareWorldData, formatComparisonReport };
