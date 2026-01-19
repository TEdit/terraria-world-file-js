/**
 * Load Test Suite
 * Validates that world files can be loaded and parsed correctly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WorldParser from '../src/browser/terraria-world-parser.js';
import { loadWorldFile } from './utils/file-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DIR = path.join(__dirname, 'world-files');

async function runLoadTests() {
  console.log('\n=== WORLD FILE LOAD TEST ===\n');

  // Get all .wld files from test directory
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.wld'))
    .sort();

  if (files.length === 0) {
    console.error('❌ No .wld files found in test/world-files');
    process.exit(1);
  }

  console.log(`Found ${files.length} test files:\n`);

  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const filename of files) {
    const filePath = path.join(TEST_DIR, filename);
    const fileSize = fs.statSync(filePath).size;

    try {
      // Load file as File-like object
      const fileObj = loadWorldFile(filePath);
      
      // Parse the world
      const parser = new WorldParser();
      await parser.loadFile(fileObj);
      const world = parser.parse();

      // Validate basic structure
      const checks = {
        fileFormatHeader: !!world.fileFormatHeader,
        fileFormatHeaderVersion: world.fileFormatHeader?.version !== undefined,
        header: !!world.header,
        tiles: !!world.tiles,
        tileDimensions: world.tiles?.length > 0 && world.tiles[0]?.length > 0,
        chests: Array.isArray(world.chests),
        signs: Array.isArray(world.signs),
        NPCs: world.NPCs && world.NPCs.NPCs !== undefined,
        tileEntities: Array.isArray(world.tileEntities)
      };

      const allChecksPassed = Object.values(checks).every(v => v);

      if (allChecksPassed) {
        passCount++;
        console.log(`✓ ${filename}`);
        console.log(`  Size: ${fileSize} bytes | Version: ${world.fileFormatHeader.version} | Tiles: ${world.tiles.length}x${world.tiles[0].length}`);
        console.log(`  Entities: ${world.chests.length} chests, ${world.signs.length} signs, ${world.NPCs.NPCs.length} NPCs`);
        results.push({ file: filename, status: 'PASS', world });
      } else {
        failCount++;
        console.log(`✗ ${filename}`);
        console.log(`  Size: ${fileSize} bytes`);
        Object.entries(checks).forEach(([check, passed]) => {
          if (!passed) {
            console.log(`  ❌ Missing or invalid: ${check}`);
          }
        });
        results.push({ file: filename, status: 'FAIL', error: 'Validation checks failed' });
      }
    } catch (err) {
      failCount++;
      console.log(`✗ ${filename}`);
      console.log(`  Error: ${err.message}`);
      results.push({ file: filename, status: 'FAIL', error: err.message });
    }

    console.log();
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Passed: ${passCount}/${files.length}`);
  console.log(`Failed: ${failCount}/${files.length}`);

  if (failCount > 0) {
    console.log('\nFailed files:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
    process.exit(1);
  }

  console.log('\n✓ All load tests passed!\n');
  process.exit(0);
}

runLoadTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
