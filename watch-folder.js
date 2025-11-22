#!/usr/bin/env node

/**
 * Watch Folder - Auto-Ingest for ChromaDB
 *
 * Monitors directories for new files and automatically ingests them.
 * Perfect for creators who want hands-free file organization.
 *
 * Features:
 * - Watch multiple folders simultaneously
 * - Filter by file type/extension
 * - Debounced processing (handles burst file additions)
 * - Persistent watch state
 */

import { watch } from 'fs';
import { readFile, writeFile, stat, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { processFile, getFileCategory } from './batch-processor.js';
import { extractExif, exifToMetadata, exifToSummary } from './exif-extractor.js';

// Active watchers registry
const activeWatchers = new Map();

// State file for persistence
const STATE_FILE = join(process.env.HOME || '/tmp', '.chromadb-watchers.json');

/**
 * Load saved watcher state
 */
async function loadWatcherState() {
  try {
    const content = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { watchers: [] };
  }
}

/**
 * Save watcher state
 */
async function saveWatcherState(state) {
  try {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`Failed to save watcher state: ${error.message}`);
  }
}

/**
 * Process a new file and add to ChromaDB
 */
async function processNewFile(filePath, options, chromaClient) {
  const { collection, categories, extensions, includeExif } = options;

  try {
    // Check if file matches filters
    const category = getFileCategory(filePath);

    if (categories && categories.length > 0) {
      if (!categories.includes(category.type)) {
        return { skipped: true, reason: 'category_mismatch' };
      }
    }

    if (extensions && extensions.length > 0) {
      const ext = filePath.toLowerCase().split('.').pop();
      if (!extensions.includes(`.${ext}`) && !extensions.includes(ext)) {
        return { skipped: true, reason: 'extension_mismatch' };
      }
    }

    // Process the file
    const processed = await processFile(filePath, { includeContent: true });

    // Extract EXIF for images if enabled
    let exifMeta = {};
    let exifSummary = '';
    if (includeExif && category.type === 'images') {
      const exif = await extractExif(filePath);
      if (exif.hasExif) {
        exifMeta = exifToMetadata(exif);
        exifSummary = exifToSummary(exif);
      }
    }

    // Add to ChromaDB
    const coll = await chromaClient.getOrCreateCollection({ name: collection });

    const content = exifSummary
      ? `${processed.content}\n\nEXIF Data:\n${exifSummary}`
      : processed.content;

    await coll.add({
      ids: [processed.id],
      documents: [content],
      metadatas: [{
        ...processed.metadata,
        ...exifMeta,
        auto_ingested: true,
        ingested_at: new Date().toISOString(),
        watch_folder: dirname(filePath)
      }]
    });

    return {
      success: true,
      id: processed.id,
      file: processed.metadata.filename,
      type: category.type,
      hasExif: Object.keys(exifMeta).length > 0
    };

  } catch (error) {
    return { success: false, error: error.message, file: filePath };
  }
}

/**
 * Create a debounced file processor
 */
function createDebouncedProcessor(options, chromaClient) {
  const pending = new Map();
  const processed = new Set();
  let timeoutId = null;
  const debounceMs = options.debounceMs || 1000;

  async function processPending() {
    const files = Array.from(pending.keys());
    pending.clear();

    const results = [];
    for (const file of files) {
      if (processed.has(file)) continue;

      // Verify file exists and is accessible
      try {
        await access(file);
        const stats = await stat(file);

        // Skip directories
        if (stats.isDirectory()) continue;

        // Skip very small files (likely still being written)
        if (stats.size < 10) continue;

        processed.add(file);
        const result = await processNewFile(file, options, chromaClient);
        results.push(result);

        if (result.success) {
          console.error(`📥 Auto-ingested: ${result.file} (${result.type})`);
        } else if (!result.skipped) {
          console.error(`⚠️ Failed to ingest: ${file} - ${result.error}`);
        }

      } catch (error) {
        // File not ready or doesn't exist
      }
    }

    return results;
  }

  return {
    add(filePath) {
      pending.set(filePath, Date.now());

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        processPending();
      }, debounceMs);
    },

    getProcessedCount() {
      return processed.size;
    },

    clear() {
      processed.clear();
      pending.clear();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

/**
 * Start watching a folder
 */
export async function startWatcher(watchPath, options, chromaClient) {
  const {
    collection = 'auto_ingest',
    categories = null,
    extensions = null,
    recursive = true,
    includeExif = true,
    debounceMs = 1000
  } = options;

  // Check if already watching
  if (activeWatchers.has(watchPath)) {
    return {
      success: false,
      error: 'Already watching this path',
      watchPath
    };
  }

  // Verify path exists
  try {
    const stats = await stat(watchPath);
    if (!stats.isDirectory()) {
      return { success: false, error: 'Path is not a directory', watchPath };
    }
  } catch {
    return { success: false, error: 'Path does not exist', watchPath };
  }

  // Create debounced processor
  const processor = createDebouncedProcessor({
    collection,
    categories,
    extensions,
    includeExif,
    debounceMs
  }, chromaClient);

  // Start watcher
  const watcher = watch(watchPath, { recursive }, (eventType, filename) => {
    if (eventType === 'rename' || eventType === 'change') {
      if (filename) {
        const fullPath = join(watchPath, filename);
        processor.add(fullPath);
      }
    }
  });

  // Store watcher info
  const watcherInfo = {
    watcher,
    processor,
    options: { collection, categories, extensions, recursive, includeExif },
    startedAt: new Date().toISOString()
  };

  activeWatchers.set(watchPath, watcherInfo);

  // Save state
  const state = await loadWatcherState();
  state.watchers = state.watchers.filter(w => w.path !== watchPath);
  state.watchers.push({
    path: watchPath,
    collection,
    categories,
    extensions,
    recursive,
    includeExif,
    startedAt: watcherInfo.startedAt
  });
  await saveWatcherState(state);

  console.error(`👁️ Started watching: ${watchPath} -> ${collection}`);

  return {
    success: true,
    watchPath,
    collection,
    options: { categories, extensions, recursive, includeExif }
  };
}

/**
 * Stop watching a folder
 */
export async function stopWatcher(watchPath) {
  const watcherInfo = activeWatchers.get(watchPath);

  if (!watcherInfo) {
    return { success: false, error: 'Not watching this path', watchPath };
  }

  // Close watcher
  watcherInfo.watcher.close();
  watcherInfo.processor.clear();

  // Remove from registry
  activeWatchers.delete(watchPath);

  // Update state
  const state = await loadWatcherState();
  state.watchers = state.watchers.filter(w => w.path !== watchPath);
  await saveWatcherState(state);

  console.error(`🛑 Stopped watching: ${watchPath}`);

  return {
    success: true,
    watchPath,
    filesProcessed: watcherInfo.processor.getProcessedCount()
  };
}

/**
 * List all active watchers
 */
export function listWatchers() {
  const watchers = [];

  for (const [path, info] of activeWatchers) {
    watchers.push({
      path,
      collection: info.options.collection,
      categories: info.options.categories,
      extensions: info.options.extensions,
      recursive: info.options.recursive,
      includeExif: info.options.includeExif,
      startedAt: info.startedAt,
      filesProcessed: info.processor.getProcessedCount()
    });
  }

  return watchers;
}

/**
 * Get watcher status
 */
export function getWatcherStatus(watchPath) {
  const info = activeWatchers.get(watchPath);

  if (!info) {
    return { active: false, watchPath };
  }

  return {
    active: true,
    watchPath,
    collection: info.options.collection,
    startedAt: info.startedAt,
    filesProcessed: info.processor.getProcessedCount()
  };
}

/**
 * Restore watchers from saved state (call on server startup)
 */
export async function restoreWatchers(chromaClient) {
  const state = await loadWatcherState();
  const restored = [];

  for (const config of state.watchers) {
    try {
      const result = await startWatcher(config.path, {
        collection: config.collection,
        categories: config.categories,
        extensions: config.extensions,
        recursive: config.recursive,
        includeExif: config.includeExif
      }, chromaClient);

      if (result.success) {
        restored.push(config.path);
      }
    } catch (error) {
      console.error(`Failed to restore watcher for ${config.path}: ${error.message}`);
    }
  }

  return restored;
}

/**
 * Stop all watchers
 */
export async function stopAllWatchers() {
  const paths = Array.from(activeWatchers.keys());
  const results = [];

  for (const path of paths) {
    const result = await stopWatcher(path);
    results.push(result);
  }

  return results;
}

export default {
  startWatcher,
  stopWatcher,
  listWatchers,
  getWatcherStatus,
  restoreWatchers,
  stopAllWatchers
};
