#!/usr/bin/env node

/**
 * Fast Batch File Processor for ChromaDB
 *
 * Handles rapid ingestion of:
 * - Photos (JPEG, PNG, HEIC, RAW) with EXIF extraction
 * - CAD files (DXF, DWG, STEP, STL, OBJ)
 * - Documents (PDF, TXT, MD, JSON, YAML)
 * - Code files (JS, TS, PY, etc.)
 *
 * Features:
 * - Parallel processing with configurable concurrency
 * - Automatic metadata extraction + EXIF for photos
 * - Progress tracking
 * - Temporary collections for quick load/unload
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename, dirname, relative } from 'path';
import { createHash } from 'crypto';

// Lazy load EXIF extractor to avoid circular deps
let exifExtractor = null;
async function getExifExtractor() {
  if (!exifExtractor) {
    exifExtractor = await import('./exif-extractor.js');
  }
  return exifExtractor;
}

// File type configurations
export const FILE_TYPES = {
  images: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif', '.tiff', '.tif', '.raw', '.cr2', '.nef', '.arw'],
    category: 'image',
    extractText: false
  },
  cad: {
    extensions: ['.dxf', '.dwg', '.step', '.stp', '.stl', '.obj', '.iges', '.igs', '.fbx', '.3ds', '.blend', '.skp', '.fcstd', '.scad'],
    category: 'cad',
    extractText: false
  },
  documents: {
    extensions: ['.pdf', '.txt', '.md', '.markdown', '.rst', '.doc', '.docx', '.rtf', '.odt'],
    category: 'document',
    extractText: true
  },
  data: {
    extensions: ['.json', '.yaml', '.yml', '.xml', '.csv', '.tsv', '.toml', '.ini', '.conf', '.config'],
    category: 'data',
    extractText: true
  },
  code: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.vue', '.svelte', '.html', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat'],
    category: 'code',
    extractText: true
  }
};

// Get file category based on extension
export function getFileCategory(filePath) {
  const ext = extname(filePath).toLowerCase();

  for (const [type, config] of Object.entries(FILE_TYPES)) {
    if (config.extensions.includes(ext)) {
      return { type, ...config };
    }
  }

  return { type: 'unknown', category: 'unknown', extractText: false };
}

// Generate unique document ID from file path
export function generateDocId(filePath, prefix = 'file') {
  const hash = createHash('md5').update(filePath).digest('hex').slice(0, 8);
  const name = basename(filePath).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
  return `${prefix}_${name}_${hash}`;
}

// Extract metadata from file stats
async function extractFileMetadata(filePath) {
  try {
    const stats = await stat(filePath);
    const ext = extname(filePath).toLowerCase();
    const category = getFileCategory(filePath);

    return {
      filename: basename(filePath),
      extension: ext,
      directory: dirname(filePath),
      size_bytes: stats.size,
      size_human: formatBytes(stats.size),
      created_at: stats.birthtime?.toISOString() || stats.ctime.toISOString(),
      modified_at: stats.mtime.toISOString(),
      file_type: category.type,
      category: category.category,
      is_binary: !category.extractText
    };
  } catch (error) {
    return {
      filename: basename(filePath),
      extension: extname(filePath).toLowerCase(),
      error: error.message
    };
  }
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Extract EXIF-like metadata from images (with full EXIF for JPEG/TIFF)
async function extractImageMetadata(filePath, includeExif = true) {
  const base = await extractFileMetadata(filePath);
  const ext = extname(filePath).toLowerCase();

  // Try to read first bytes for basic image info
  try {
    const buffer = await readFile(filePath);
    const info = {
      ...base,
      file_signature: buffer.slice(0, 4).toString('hex')
    };

    // PNG dimensions
    if (ext === '.png' && buffer.length > 24) {
      info.width = buffer.readUInt32BE(16);
      info.height = buffer.readUInt32BE(20);
    }

    // JPEG dimensions (simplified)
    if ((ext === '.jpg' || ext === '.jpeg') && buffer.length > 2) {
      // Look for SOF0 marker
      for (let i = 0; i < buffer.length - 10; i++) {
        if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
          info.height = buffer.readUInt16BE(i + 5);
          info.width = buffer.readUInt16BE(i + 7);
          break;
        }
      }
    }

    // Extract full EXIF data for supported formats
    if (includeExif && ['.jpg', '.jpeg', '.tiff', '.tif'].includes(ext)) {
      try {
        const exifModule = await getExifExtractor();
        const exif = await exifModule.extractExif(filePath);

        if (exif.hasExif) {
          // Add camera info
          if (exif.camera?.make) info.camera_make = exif.camera.make;
          if (exif.camera?.model) info.camera_model = exif.camera.model;

          // Add lens info
          if (exif.lens?.model) info.lens_model = exif.lens.model;
          if (exif.lens?.focalLength) info.focal_length = exif.lens.focalLength;
          if (exif.lens?.focalLength35mm) info.focal_length_35mm = exif.lens.focalLength35mm;

          // Add exposure info
          if (exif.exposure?.aperture) info.aperture = exif.exposure.aperture;
          if (exif.exposure?.time) info.shutter_speed = exif.exposure.time;
          if (exif.exposure?.iso) info.iso = exif.exposure.iso;
          if (exif.exposure?.flash) info.flash = exif.exposure.flash;

          // Add date/time
          if (exif.datetime?.original) info.date_taken = exif.datetime.original;

          // Add GPS
          if (exif.gps) {
            info.gps_latitude = exif.gps.latitude;
            info.gps_longitude = exif.gps.longitude;
            info.gps_location = `${exif.gps.latitude}, ${exif.gps.longitude}`;
            if (exif.gps.altitude) info.gps_altitude = exif.gps.altitude;
          }

          // Use EXIF dimensions if available
          if (exif.image?.width) info.width = exif.image.width;
          if (exif.image?.height) info.height = exif.image.height;
          if (exif.image?.orientation) info.orientation = exif.image.orientation;

          info.has_exif = true;
        }
      } catch (exifError) {
        // EXIF extraction failed, continue with basic info
        info.exif_error = exifError.message;
      }
    }

    return info;
  } catch (error) {
    return { ...base, read_error: error.message };
  }
}

// Extract CAD file metadata
async function extractCADMetadata(filePath) {
  const base = await extractFileMetadata(filePath);
  const ext = extname(filePath).toLowerCase();

  const info = {
    ...base,
    cad_format: ext.slice(1).toUpperCase()
  };

  // Try to extract basic info from text-based CAD formats
  try {
    if (['.dxf', '.obj', '.stl'].includes(ext)) {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);

      if (ext === '.stl') {
        info.is_ascii = content.toLowerCase().startsWith('solid');
        const solidMatch = content.match(/solid\s+(\S+)/i);
        if (solidMatch) info.solid_name = solidMatch[1];
      }

      if (ext === '.obj') {
        const vertices = content.match(/^v\s/gm);
        const faces = content.match(/^f\s/gm);
        info.vertex_count = vertices?.length || 0;
        info.face_count = faces?.length || 0;
      }

      if (ext === '.dxf') {
        info.has_entities = content.includes('ENTITIES');
        info.has_blocks = content.includes('BLOCKS');
      }
    }
  } catch (error) {
    // Binary file or read error - that's okay
  }

  return info;
}

// Read text content from file
async function readTextContent(filePath, maxSize = 1024 * 100) { // 100KB max
  try {
    const stats = await stat(filePath);
    if (stats.size > maxSize) {
      const buffer = await readFile(filePath);
      return buffer.slice(0, maxSize).toString('utf-8') + '\n\n[... truncated ...]';
    }
    return await readFile(filePath, 'utf-8');
  } catch (error) {
    return `[Error reading file: ${error.message}]`;
  }
}

// Process a single file for ChromaDB ingestion
export async function processFile(filePath, options = {}) {
  const {
    includeContent = true,
    maxContentSize = 100 * 1024, // 100KB
    basePath = null
  } = options;

  const category = getFileCategory(filePath);
  let metadata;
  let content;

  // Extract type-specific metadata
  switch (category.type) {
    case 'images':
      metadata = await extractImageMetadata(filePath);
      // For images, content is a description
      content = `Image file: ${metadata.filename}\nDimensions: ${metadata.width || 'unknown'}x${metadata.height || 'unknown'}\nSize: ${metadata.size_human}\nFormat: ${metadata.extension}`;
      break;

    case 'cad':
      metadata = await extractCADMetadata(filePath);
      content = `CAD file: ${metadata.filename}\nFormat: ${metadata.cad_format}\nSize: ${metadata.size_human}`;
      if (metadata.vertex_count) content += `\nVertices: ${metadata.vertex_count}, Faces: ${metadata.face_count}`;
      break;

    default:
      metadata = await extractFileMetadata(filePath);
      if (category.extractText && includeContent) {
        content = await readTextContent(filePath, maxContentSize);
      } else {
        content = `File: ${metadata.filename}\nType: ${metadata.file_type}\nSize: ${metadata.size_human}`;
      }
  }

  // Add relative path if basePath provided
  if (basePath) {
    metadata.relative_path = relative(basePath, filePath);
  }

  metadata.full_path = filePath;
  metadata.processed_at = new Date().toISOString();

  return {
    id: generateDocId(filePath),
    content,
    metadata
  };
}

// Scan directory for files matching criteria
export async function scanDirectory(dirPath, options = {}) {
  const {
    recursive = true,
    extensions = null, // null = all, or array like ['.jpg', '.png']
    categories = null, // null = all, or array like ['images', 'cad']
    maxFiles = 10000,
    excludePatterns = [/node_modules/, /\.git/, /\.DS_Store/, /__pycache__/]
  } = options;

  const files = [];

  async function scan(currentPath) {
    if (files.length >= maxFiles) return;

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = join(currentPath, entry.name);

        // Check exclude patterns
        if (excludePatterns.some(pattern => pattern.test(fullPath))) {
          continue;
        }

        if (entry.isDirectory() && recursive) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          const category = getFileCategory(fullPath);

          // Filter by extension
          if (extensions && !extensions.includes(ext)) {
            continue;
          }

          // Filter by category
          if (categories && !categories.includes(category.type)) {
            continue;
          }

          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning ${currentPath}: ${error.message}`);
    }
  }

  await scan(dirPath);
  return files;
}

// Batch process files with progress tracking
export async function batchProcessFiles(files, options = {}) {
  const {
    concurrency = 10,
    onProgress = null,
    includeContent = true,
    maxContentSize = 100 * 1024,
    basePath = null
  } = options;

  const results = [];
  const errors = [];
  let processed = 0;

  // Process in batches for concurrency control
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const result = await processFile(file, { includeContent, maxContentSize, basePath });
          return { success: true, result };
        } catch (error) {
          return { success: false, file, error: error.message };
        }
      })
    );

    for (const res of batchResults) {
      if (res.success) {
        results.push(res.result);
      } else {
        errors.push({ file: res.file, error: res.error });
      }
      processed++;

      if (onProgress) {
        onProgress({
          processed,
          total: files.length,
          percent: Math.round((processed / files.length) * 100),
          current: res.success ? res.result?.metadata?.filename : res.file
        });
      }
    }
  }

  return { results, errors, stats: { total: files.length, processed: results.length, failed: errors.length } };
}

// Export collection to JSON
export async function exportCollection(client, collectionName) {
  try {
    const collection = await client.getCollection({ name: collectionName });
    const data = await collection.get();

    return {
      name: collectionName,
      exported_at: new Date().toISOString(),
      count: data.ids.length,
      documents: data.ids.map((id, idx) => ({
        id,
        content: data.documents[idx],
        metadata: data.metadatas[idx]
      }))
    };
  } catch (error) {
    throw new Error(`Failed to export collection: ${error.message}`);
  }
}

// Import collection from JSON
export async function importCollection(client, data, options = {}) {
  const { overwrite = false, collectionName = null } = options;
  const name = collectionName || data.name;

  try {
    if (overwrite) {
      try {
        await client.deleteCollection({ name });
      } catch (e) {
        // Collection might not exist
      }
    }

    const collection = await client.getOrCreateCollection({ name });

    // Batch insert
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < data.documents.length; i += batchSize) {
      const batch = data.documents.slice(i, i + batchSize);

      await collection.add({
        ids: batch.map(d => d.id),
        documents: batch.map(d => d.content),
        metadatas: batch.map(d => d.metadata || {})
      });

      imported += batch.length;
    }

    return { success: true, collection: name, imported };
  } catch (error) {
    throw new Error(`Failed to import collection: ${error.message}`);
  }
}

// Quick stats about a directory
export async function getDirectoryStats(dirPath, options = {}) {
  const files = await scanDirectory(dirPath, { ...options, maxFiles: 100000 });

  const stats = {
    total_files: files.length,
    by_category: {},
    by_extension: {},
    total_size: 0
  };

  for (const file of files) {
    const category = getFileCategory(file);
    const ext = extname(file).toLowerCase();

    stats.by_category[category.type] = (stats.by_category[category.type] || 0) + 1;
    stats.by_extension[ext] = (stats.by_extension[ext] || 0) + 1;

    try {
      const fileStat = await stat(file);
      stats.total_size += fileStat.size;
    } catch (e) {
      // Ignore stat errors
    }
  }

  stats.total_size_human = formatBytes(stats.total_size);

  return stats;
}

export default {
  FILE_TYPES,
  getFileCategory,
  generateDocId,
  processFile,
  scanDirectory,
  batchProcessFiles,
  exportCollection,
  importCollection,
  getDirectoryStats
};
