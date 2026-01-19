/**
 * Load-Save-Load Test Suite
 * Validates world file integrity by loading, saving, and reloading to detect corruption
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WorldParser from '../src/browser/terraria-world-parser.js';
import WorldSaver from '../src/browser/terraria-world-saver.js';
import { loadWorldFile, createFileFromBuffer } from './utils/file-adapter.js';
import { compareWorldData, formatComparisonReport } from './utils/compare-world-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DIR = path.join(__dirname, 'world-files');
const OUTPUT_DIR = path.join(__dirname, '.test-output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function runLoadSaveLoadTests() {
  console.log('\n=== WORLD FILE LOAD-SAVE-LOAD TEST ===\n');

  // Get all .wld files from test directory
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.wld'))
    .sort();

  if (files.length === 0) {
    console.error('❌ No .wld files found in test/world-files');
    process.exit(1);
  }

  console.log(`Found ${files.length} test files\n`);

  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const filename of files) {
    const filePath = path.join(TEST_DIR, filename);
    const fileSize = fs.statSync(filePath).size;

    console.log(`Testing ${filename}...`);

    try {
      // ========== STEP 1: LOAD ORIGINAL FILE ==========
      const fileObj = loadWorldFile(filePath);
      const parser1 = new WorldParser();
      await parser1.loadFile(fileObj);
      const originalWorld = parser1.parse();

      console.log(`  ✓ Loaded original (${fileSize} bytes)`);

      // ========== STEP 2: SAVE TO BUFFER ==========
      const saver = new WorldSaver();
      const savedBuffer = saver.save({ world: originalWorld });

      // Save to disk for debugging if needed
      const savedFilePath = path.join(OUTPUT_DIR, `${path.basename(filename, '.wld')}-resaved.wld`);
      fs.writeFileSync(savedFilePath, Buffer.from(savedBuffer));

      console.log(`  ✓ Saved to buffer (${savedBuffer.byteLength} bytes)`);

      // ========== STEP 3: RELOAD FROM SAVED BUFFER ==========
      const fileObjReloaded = createFileFromBuffer(savedBuffer, filename);
      const parser2 = new WorldParser();
      await parser2.loadFile(fileObjReloaded);
      const reloadedWorld = parser2.parse();

      console.log(`  ✓ Reloaded from buffer`);

      // ========== STEP 4: COMPARE DATA ==========
      const comparison = compareWorldData(originalWorld, reloadedWorld, filename);

      if (comparison.isValid) {
        passCount++;
        console.log(`  ✓ DATA MATCH - No corruption detected`);
        results.push({ file: filename, status: 'PASS', comparison });
      } else {
        failCount++;
        console.log(`  ✗ CORRUPTION DETECTED - ${comparison.differences.length} differences found`);
        results.push({ file: filename, status: 'FAIL', comparison });
      }

      // Print warnings regardless of pass/fail
      if (comparison.warnings.length > 0) {
        console.log(`  ⚠ ${comparison.warnings.length} warnings:`);
        comparison.warnings.slice(0, 3).forEach(w => {
          console.log(`    - ${w.field}: ${w.message}`);
        });
      }

      console.log();
    } catch (err) {
      failCount++;
      console.log(`  ✗ ERROR: ${err.message}`);
      results.push({ file: filename, status: 'ERROR', error: err.message });
      console.log();
    }
  }

  // ========== DETAILED REPORT ==========
  console.log('\n=== DETAILED RESULTS ===');
  
  results.forEach(result => {
    if (result.status === 'PASS') {
      console.log(`✓ ${result.file}`);
      if (result.comparison) {
        console.log(`  Checks passed: ${Object.keys(result.comparison.matches).length}`);
        if (result.comparison.warnings.length > 0) {
          console.log(`  Warnings: ${result.comparison.warnings.length}`);
        }
      }
    } else if (result.status === 'FAIL') {
      console.log(formatComparisonReport(result.comparison));
    } else {
      console.log(`✗ ${result.file}`);
      console.log(`  Error: ${result.error}`);
    }
  });

  // ========== SUMMARY ==========
  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${passCount}/${files.length}`);
  console.log(`Failed: ${failCount}/${files.length}`);

  if (failCount > 0) {
    console.log('\nFailed tests require investigation:');
    results.filter(r => r.status !== 'PASS').forEach(r => {
      if (r.comparison?.differences.length > 0) {
        console.log(`\n  ${r.file}: ${r.comparison.differences.length} differences`);
        r.comparison.differences.slice(0, 3).forEach(d => {
          console.log(`    - ${d.field}: ${JSON.stringify(d.original)} → ${JSON.stringify(d.reloaded)}`);
        });
        if (r.comparison.differences.length > 3) {
          console.log(`    ... and ${r.comparison.differences.length - 3} more`);
        }
      } else {
        console.log(`\n  ${r.file}: ${r.error}`);
      }
    });
    process.exit(1);
  }

  console.log('\n✓ All load-save-load tests passed!\n');
  console.log(`Saved test output files to: ${OUTPUT_DIR}\n`);
  process.exit(0);
}

runLoadSaveLoadTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
