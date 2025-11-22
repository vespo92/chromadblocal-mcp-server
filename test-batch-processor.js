#!/usr/bin/env node

/**
 * Test script for batch file processing functionality
 * Run with: bun run test:batch
 */

import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import {
  FILE_TYPES,
  getFileCategory,
  generateDocId,
  processFile,
  scanDirectory,
  batchProcessFiles,
  getDirectoryStats
} from './batch-processor.js';

const TEST_DIR = '/tmp/chromadb-batch-test';

// Test utilities
function log(msg, type = 'info') {
  const icons = { info: '📋', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type] || '•'} ${msg}`);
}

async function createTestFiles() {
  log('Creating test files...');

  // Create test directory structure
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(join(TEST_DIR, 'images'), { recursive: true });
  await mkdir(join(TEST_DIR, 'cad'), { recursive: true });
  await mkdir(join(TEST_DIR, 'code'), { recursive: true });
  await mkdir(join(TEST_DIR, 'docs'), { recursive: true });

  // Create sample files
  const files = [
    // Code files
    {
      path: join(TEST_DIR, 'code/app.js'),
      content: `// Sample JavaScript application
import express from 'express';

const app = express();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
`
    },
    {
      path: join(TEST_DIR, 'code/utils.py'),
      content: `"""Python utility functions"""

def calculate_area(width: float, height: float) -> float:
    """Calculate area of a rectangle"""
    return width * height

def process_data(items: list) -> dict:
    """Process list of items"""
    return {
        'count': len(items),
        'items': items
    }
`
    },
    // Documents
    {
      path: join(TEST_DIR, 'docs/README.md'),
      content: `# Test Project

This is a test project for batch processing.

## Features
- Fast file ingestion
- Automatic metadata extraction
- Support for multiple file types

## Usage
Run the batch processor to ingest files.
`
    },
    {
      path: join(TEST_DIR, 'docs/config.json'),
      content: JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        settings: {
          maxFiles: 1000,
          enableLogging: true
        }
      }, null, 2)
    },
    // CAD file (mock - just text content)
    {
      path: join(TEST_DIR, 'cad/part.obj'),
      content: `# Simple OBJ file
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`
    },
    {
      path: join(TEST_DIR, 'cad/model.stl'),
      content: `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0.5 1 0
    endloop
  endfacet
endsolid test
`
    },
    // Image placeholders (small binary files)
    {
      path: join(TEST_DIR, 'images/photo1.txt'),
      content: 'Placeholder for photo 1'
    },
    {
      path: join(TEST_DIR, 'images/photo2.txt'),
      content: 'Placeholder for photo 2'
    }
  ];

  // Create a minimal PNG (1x1 pixel transparent)
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);

  // Create a minimal JPEG
  const jpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
    0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
    0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
    0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
    0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34,
    0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4,
    0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF,
    0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
    0x00, 0x7F, 0xFF, 0xD9
  ]);

  files.push(
    { path: join(TEST_DIR, 'images/test.png'), content: pngBuffer },
    { path: join(TEST_DIR, 'images/photo.jpg'), content: jpegBuffer }
  );

  for (const file of files) {
    await writeFile(file.path, file.content);
  }

  log(`Created ${files.length} test files`, 'success');
  return TEST_DIR;
}

async function cleanupTestFiles() {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
    log('Cleaned up test files', 'success');
  } catch (e) {
    log(`Cleanup warning: ${e.message}`, 'warning');
  }
}

// Test functions
async function testFileCategories() {
  log('\n=== Testing File Category Detection ===');

  const testCases = [
    { file: 'photo.jpg', expected: 'images' },
    { file: 'model.stl', expected: 'cad' },
    { file: 'app.js', expected: 'code' },
    { file: 'config.json', expected: 'data' },
    { file: 'readme.md', expected: 'documents' },
    { file: 'unknown.xyz', expected: 'unknown' }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = getFileCategory(tc.file);
    if (result.type === tc.expected) {
      log(`  ${tc.file} -> ${result.type}`, 'success');
      passed++;
    } else {
      log(`  ${tc.file} -> ${result.type} (expected: ${tc.expected})`, 'error');
    }
  }

  log(`Category detection: ${passed}/${testCases.length} passed`);
  return passed === testCases.length;
}

async function testDocIdGeneration() {
  log('\n=== Testing Document ID Generation ===');

  const ids = [
    generateDocId('/path/to/file.jpg'),
    generateDocId('/path/to/file.jpg'), // Same path should give same ID
    generateDocId('/different/path/file.jpg') // Different path, different ID
  ];

  const passed = ids[0] === ids[1] && ids[0] !== ids[2];
  log(`ID consistency: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');
  log(`  Sample ID: ${ids[0]}`);

  return passed;
}

async function testDirectoryScan(testDir) {
  log('\n=== Testing Directory Scan ===');

  // Test full scan
  const allFiles = await scanDirectory(testDir, { recursive: true });
  log(`  Found ${allFiles.length} total files`);

  // Test filtered scan - code only
  const codeFiles = await scanDirectory(testDir, {
    recursive: true,
    categories: ['code']
  });
  log(`  Found ${codeFiles.length} code files`);

  // Test extension filter
  const jsFiles = await scanDirectory(testDir, {
    recursive: true,
    extensions: ['.js']
  });
  log(`  Found ${jsFiles.length} .js files`);

  const passed = allFiles.length >= 8 && codeFiles.length >= 1 && jsFiles.length >= 1;
  log(`Directory scan: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');

  return passed;
}

async function testDirectoryStats(testDir) {
  log('\n=== Testing Directory Stats ===');

  const stats = await getDirectoryStats(testDir);

  log(`  Total files: ${stats.total_files}`);
  log(`  Total size: ${stats.total_size_human}`);
  log(`  Categories: ${JSON.stringify(stats.by_category)}`);

  const passed = stats.total_files >= 8 && Object.keys(stats.by_category).length >= 3;
  log(`Directory stats: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');

  return passed;
}

async function testFileProcessing(testDir) {
  log('\n=== Testing File Processing ===');

  // Test code file processing
  const jsFile = await processFile(join(testDir, 'code/app.js'));
  log(`  Processed JS file: ${jsFile.metadata.filename}`);
  log(`    - Size: ${jsFile.metadata.size_human}`);
  log(`    - Type: ${jsFile.metadata.file_type}`);

  // Test CAD file processing
  const objFile = await processFile(join(testDir, 'cad/part.obj'));
  log(`  Processed OBJ file: ${objFile.metadata.filename}`);
  log(`    - Vertices: ${objFile.metadata.vertex_count || 'N/A'}`);

  // Test image processing
  const pngFile = await processFile(join(testDir, 'images/test.png'));
  log(`  Processed PNG file: ${pngFile.metadata.filename}`);
  log(`    - Dimensions: ${pngFile.metadata.width || 'N/A'}x${pngFile.metadata.height || 'N/A'}`);

  const passed = jsFile.content.length > 0 && objFile.metadata.cad_format === 'OBJ';
  log(`File processing: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');

  return passed;
}

async function testBatchProcessing(testDir) {
  log('\n=== Testing Batch Processing ===');

  const files = await scanDirectory(testDir);

  let progressUpdates = 0;
  const { results, errors, stats } = await batchProcessFiles(files, {
    concurrency: 5,
    onProgress: (p) => {
      progressUpdates++;
    }
  });

  log(`  Processed: ${stats.processed} files`);
  log(`  Errors: ${stats.failed} files`);
  log(`  Progress updates received: ${progressUpdates}`);

  const passed = stats.processed >= 8 && stats.failed === 0;
  log(`Batch processing: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');

  return passed;
}

async function testSupportedTypes() {
  log('\n=== Testing Supported File Types ===');

  const totalExtensions = Object.values(FILE_TYPES)
    .flatMap(t => t.extensions).length;

  log(`  Image extensions: ${FILE_TYPES.images.extensions.length}`);
  log(`  CAD extensions: ${FILE_TYPES.cad.extensions.length}`);
  log(`  Document extensions: ${FILE_TYPES.documents.extensions.length}`);
  log(`  Data extensions: ${FILE_TYPES.data.extensions.length}`);
  log(`  Code extensions: ${FILE_TYPES.code.extensions.length}`);
  log(`  Total: ${totalExtensions} extensions supported`);

  const passed = totalExtensions >= 50;
  log(`Supported types: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');

  return passed;
}

// Main test runner
async function runTests() {
  console.log('\n🧪 ChromaDB Batch Processor Test Suite\n');
  console.log('=' .repeat(50));

  let testDir;
  const results = [];

  try {
    // Setup
    testDir = await createTestFiles();

    // Run tests
    results.push(['File Categories', await testFileCategories()]);
    results.push(['Doc ID Generation', await testDocIdGeneration()]);
    results.push(['Directory Scan', await testDirectoryScan(testDir)]);
    results.push(['Directory Stats', await testDirectoryStats(testDir)]);
    results.push(['File Processing', await testFileProcessing(testDir)]);
    results.push(['Batch Processing', await testBatchProcessing(testDir)]);
    results.push(['Supported Types', await testSupportedTypes()]);

  } finally {
    // Cleanup
    if (testDir) {
      await cleanupTestFiles();
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('\n📊 Test Summary:\n');

  const passed = results.filter(r => r[1]).length;
  const failed = results.filter(r => !r[1]).length;

  for (const [name, result] of results) {
    log(`  ${name}: ${result ? 'PASS' : 'FAIL'}`, result ? 'success' : 'error');
  }

  console.log(`\n  Total: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('🎉 All tests passed!\n');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
