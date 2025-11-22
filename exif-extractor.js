#!/usr/bin/env node

/**
 * EXIF Metadata Extractor for Photos
 *
 * Extracts rich metadata from JPEG/TIFF images including:
 * - Camera make/model
 * - Lens information
 * - Exposure settings (ISO, aperture, shutter speed)
 * - GPS coordinates
 * - Date/time taken
 * - Image dimensions and orientation
 *
 * Pure JavaScript implementation - no external dependencies!
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';

// EXIF tag definitions
const EXIF_TAGS = {
  // Image tags
  0x010F: 'make',
  0x0110: 'model',
  0x0112: 'orientation',
  0x011A: 'xResolution',
  0x011B: 'yResolution',
  0x0128: 'resolutionUnit',
  0x0131: 'software',
  0x0132: 'dateTime',
  0x013B: 'artist',
  0x8298: 'copyright',

  // EXIF tags
  0x829A: 'exposureTime',
  0x829D: 'fNumber',
  0x8822: 'exposureProgram',
  0x8827: 'isoSpeedRatings',
  0x9000: 'exifVersion',
  0x9003: 'dateTimeOriginal',
  0x9004: 'dateTimeDigitized',
  0x9201: 'shutterSpeedValue',
  0x9202: 'apertureValue',
  0x9203: 'brightnessValue',
  0x9204: 'exposureBiasValue',
  0x9205: 'maxApertureValue',
  0x9207: 'meteringMode',
  0x9208: 'lightSource',
  0x9209: 'flash',
  0x920A: 'focalLength',
  0xA001: 'colorSpace',
  0xA002: 'pixelXDimension',
  0xA003: 'pixelYDimension',
  0xA20E: 'focalPlaneXResolution',
  0xA20F: 'focalPlaneYResolution',
  0xA210: 'focalPlaneResolutionUnit',
  0xA217: 'sensingMethod',
  0xA300: 'fileSource',
  0xA301: 'sceneType',
  0xA401: 'customRendered',
  0xA402: 'exposureMode',
  0xA403: 'whiteBalance',
  0xA404: 'digitalZoomRatio',
  0xA405: 'focalLengthIn35mmFilm',
  0xA406: 'sceneCaptureType',
  0xA408: 'contrast',
  0xA409: 'saturation',
  0xA40A: 'sharpness',
  0xA430: 'cameraOwnerName',
  0xA431: 'bodySerialNumber',
  0xA432: 'lensSpecification',
  0xA433: 'lensMake',
  0xA434: 'lensModel',
  0xA435: 'lensSerialNumber',

  // GPS tags
  0x0000: 'gpsVersionID',
  0x0001: 'gpsLatitudeRef',
  0x0002: 'gpsLatitude',
  0x0003: 'gpsLongitudeRef',
  0x0004: 'gpsLongitude',
  0x0005: 'gpsAltitudeRef',
  0x0006: 'gpsAltitude',
  0x0007: 'gpsTimeStamp',
  0x001D: 'gpsDateStamp',
};

// Orientation values
const ORIENTATIONS = {
  1: 'Normal',
  2: 'Flipped horizontal',
  3: 'Rotated 180°',
  4: 'Flipped vertical',
  5: 'Rotated 90° CCW, flipped',
  6: 'Rotated 90° CW',
  7: 'Rotated 90° CW, flipped',
  8: 'Rotated 90° CCW',
};

// Flash values
const FLASH_VALUES = {
  0x00: 'No flash',
  0x01: 'Flash fired',
  0x05: 'Flash fired, strobe return not detected',
  0x07: 'Flash fired, strobe return detected',
  0x08: 'Flash on, did not fire',
  0x09: 'Flash on, fired',
  0x0D: 'Flash on, fired, return not detected',
  0x0F: 'Flash on, fired, return detected',
  0x10: 'Flash off',
  0x14: 'Flash off, did not fire, return not detected',
  0x18: 'Auto, did not fire',
  0x19: 'Auto, fired',
  0x1D: 'Auto, fired, return not detected',
  0x1F: 'Auto, fired, return detected',
  0x20: 'No flash function',
  0x30: 'Flash off, no flash function',
  0x41: 'Flash fired, red-eye reduction',
  0x45: 'Flash fired, red-eye reduction, return not detected',
  0x47: 'Flash fired, red-eye reduction, return detected',
  0x49: 'Flash on, red-eye reduction',
  0x4D: 'Flash on, red-eye reduction, return not detected',
  0x4F: 'Flash on, red-eye reduction, return detected',
  0x58: 'Auto, did not fire, red-eye reduction',
  0x59: 'Auto, fired, red-eye reduction',
  0x5D: 'Auto, fired, red-eye reduction, return not detected',
  0x5F: 'Auto, fired, red-eye reduction, return detected',
};

// Read bytes as string
function readString(buffer, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const char = buffer[offset + i];
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str.trim();
}

// Read unsigned short (2 bytes)
function readUShort(buffer, offset, littleEndian) {
  if (littleEndian) {
    return buffer[offset] | (buffer[offset + 1] << 8);
  }
  return (buffer[offset] << 8) | buffer[offset + 1];
}

// Read unsigned long (4 bytes)
function readULong(buffer, offset, littleEndian) {
  if (littleEndian) {
    return buffer[offset] | (buffer[offset + 1] << 8) |
           (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
  }
  return (buffer[offset] << 24) | (buffer[offset + 1] << 16) |
         (buffer[offset + 2] << 8) | buffer[offset + 3];
}

// Read rational (8 bytes - two unsigned longs)
function readRational(buffer, offset, littleEndian) {
  const numerator = readULong(buffer, offset, littleEndian);
  const denominator = readULong(buffer, offset + 4, littleEndian);
  return denominator ? numerator / denominator : 0;
}

// Read signed rational
function readSRational(buffer, offset, littleEndian) {
  let numerator = readULong(buffer, offset, littleEndian);
  let denominator = readULong(buffer, offset + 4, littleEndian);

  // Convert to signed
  if (numerator > 0x7FFFFFFF) numerator -= 0x100000000;
  if (denominator > 0x7FFFFFFF) denominator -= 0x100000000;

  return denominator ? numerator / denominator : 0;
}

// Parse IFD (Image File Directory)
function parseIFD(buffer, tiffOffset, ifdOffset, littleEndian, isGPS = false) {
  const tags = {};
  const numEntries = readUShort(buffer, tiffOffset + ifdOffset, littleEndian);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
    const tag = readUShort(buffer, entryOffset, littleEndian);
    const type = readUShort(buffer, entryOffset + 2, littleEndian);
    const count = readULong(buffer, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    let value;
    const tagName = EXIF_TAGS[tag] || `tag_${tag.toString(16)}`;

    // Calculate value size
    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const valueSize = (typeSizes[type] || 1) * count;

    // Get actual value offset (if > 4 bytes, it's a pointer)
    let dataOffset = valueOffset;
    if (valueSize > 4) {
      dataOffset = tiffOffset + readULong(buffer, valueOffset, littleEndian);
    }

    try {
      switch (type) {
        case 1: // BYTE
          value = buffer[dataOffset];
          break;
        case 2: // ASCII
          value = readString(buffer, dataOffset, count);
          break;
        case 3: // SHORT
          value = readUShort(buffer, dataOffset, littleEndian);
          break;
        case 4: // LONG
          value = readULong(buffer, dataOffset, littleEndian);
          break;
        case 5: // RATIONAL
          if (count === 1) {
            value = readRational(buffer, dataOffset, littleEndian);
          } else {
            value = [];
            for (let j = 0; j < count; j++) {
              value.push(readRational(buffer, dataOffset + (j * 8), littleEndian));
            }
          }
          break;
        case 7: // UNDEFINED
          value = buffer.slice(dataOffset, dataOffset + count);
          break;
        case 9: // SLONG
          value = readULong(buffer, dataOffset, littleEndian);
          if (value > 0x7FFFFFFF) value -= 0x100000000;
          break;
        case 10: // SRATIONAL
          value = readSRational(buffer, dataOffset, littleEndian);
          break;
        default:
          value = null;
      }

      if (value !== null && value !== undefined) {
        tags[tagName] = value;
      }
    } catch (e) {
      // Skip malformed tags
    }
  }

  return tags;
}

// Find EXIF in JPEG
function findExifInJpeg(buffer) {
  // Look for APP1 marker with EXIF
  let offset = 2; // Skip SOI marker

  while (offset < buffer.length - 4) {
    if (buffer[offset] !== 0xFF) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // APP1 marker
    if (marker === 0xE1) {
      const length = (buffer[offset + 2] << 8) | buffer[offset + 3];

      // Check for "Exif\0\0"
      if (buffer[offset + 4] === 0x45 && // E
          buffer[offset + 5] === 0x78 && // x
          buffer[offset + 6] === 0x69 && // i
          buffer[offset + 7] === 0x66 && // f
          buffer[offset + 8] === 0x00 &&
          buffer[offset + 9] === 0x00) {
        return offset + 10; // Return TIFF header offset
      }
    }

    // Skip to next marker
    if (marker >= 0xE0 && marker <= 0xEF) {
      const length = (buffer[offset + 2] << 8) | buffer[offset + 3];
      offset += 2 + length;
    } else if (marker === 0xD8 || marker === 0xD9) {
      offset += 2;
    } else if (marker === 0xDA) {
      break; // Start of scan data
    } else {
      offset++;
    }
  }

  return -1;
}

// Convert GPS coordinates to decimal
function gpsToDecimal(coords, ref) {
  if (!coords || !Array.isArray(coords) || coords.length !== 3) return null;

  const degrees = coords[0];
  const minutes = coords[1];
  const seconds = coords[2];

  let decimal = degrees + (minutes / 60) + (seconds / 3600);

  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }

  return Math.round(decimal * 1000000) / 1000000;
}

// Format exposure time as fraction
function formatExposureTime(value) {
  if (!value) return null;
  if (value >= 1) return `${value}s`;

  const denominator = Math.round(1 / value);
  return `1/${denominator}s`;
}

// Format aperture
function formatAperture(value) {
  if (!value) return null;
  return `f/${value.toFixed(1)}`;
}

/**
 * Extract EXIF metadata from an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<object>} Extracted EXIF metadata
 */
export async function extractExif(filePath) {
  const ext = extname(filePath).toLowerCase();

  // Only process JPEG/TIFF files
  if (!['.jpg', '.jpeg', '.tiff', '.tif'].includes(ext)) {
    return { supported: false, reason: `EXIF extraction not supported for ${ext}` };
  }

  try {
    const buffer = await readFile(filePath);

    // Find EXIF data
    let tiffOffset = -1;

    if (ext === '.jpg' || ext === '.jpeg') {
      // Check JPEG magic bytes
      if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
        return { supported: false, reason: 'Invalid JPEG file' };
      }
      tiffOffset = findExifInJpeg(buffer);
    } else {
      // TIFF starts with TIFF header directly
      tiffOffset = 0;
    }

    if (tiffOffset < 0) {
      return { supported: true, hasExif: false, reason: 'No EXIF data found' };
    }

    // Parse TIFF header
    const byteOrder = readString(buffer, tiffOffset, 2);
    const littleEndian = byteOrder === 'II';

    // Verify TIFF magic number
    const magic = readUShort(buffer, tiffOffset + 2, littleEndian);
    if (magic !== 42) {
      return { supported: true, hasExif: false, reason: 'Invalid TIFF header' };
    }

    // Get IFD0 offset
    const ifd0Offset = readULong(buffer, tiffOffset + 4, littleEndian);

    // Parse IFD0
    const ifd0 = parseIFD(buffer, tiffOffset, ifd0Offset, littleEndian);

    // Look for EXIF IFD pointer
    let exifData = {};
    const exifPointerTag = 0x8769;

    // Re-parse to find EXIF pointer
    const numEntries = readUShort(buffer, tiffOffset + ifd0Offset, littleEndian);
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = tiffOffset + ifd0Offset + 2 + (i * 12);
      const tag = readUShort(buffer, entryOffset, littleEndian);

      if (tag === exifPointerTag) {
        const exifOffset = readULong(buffer, entryOffset + 8, littleEndian);
        exifData = parseIFD(buffer, tiffOffset, exifOffset, littleEndian);
      }

      // GPS IFD pointer (0x8825)
      if (tag === 0x8825) {
        const gpsOffset = readULong(buffer, entryOffset + 8, littleEndian);
        const gpsData = parseIFD(buffer, tiffOffset, gpsOffset, littleEndian, true);
        Object.assign(exifData, gpsData);
      }
    }

    // Merge IFD0 and EXIF data
    const allData = { ...ifd0, ...exifData };

    // Build structured result
    const result = {
      supported: true,
      hasExif: true,

      // Camera info
      camera: {
        make: allData.make || null,
        model: allData.model || null,
        software: allData.software || null,
        artist: allData.artist || null,
        copyright: allData.copyright || null,
        bodySerialNumber: allData.bodySerialNumber || null,
      },

      // Lens info
      lens: {
        make: allData.lensMake || null,
        model: allData.lensModel || null,
        serialNumber: allData.lensSerialNumber || null,
        focalLength: allData.focalLength ? `${allData.focalLength}mm` : null,
        focalLength35mm: allData.focalLengthIn35mmFilm ? `${allData.focalLengthIn35mmFilm}mm` : null,
        maxAperture: allData.maxApertureValue ? formatAperture(Math.pow(2, allData.maxApertureValue / 2)) : null,
      },

      // Exposure settings
      exposure: {
        time: formatExposureTime(allData.exposureTime),
        timeValue: allData.exposureTime || null,
        aperture: allData.fNumber ? formatAperture(allData.fNumber) : null,
        apertureValue: allData.fNumber || null,
        iso: allData.isoSpeedRatings || null,
        exposureBias: allData.exposureBiasValue ? `${allData.exposureBiasValue > 0 ? '+' : ''}${allData.exposureBiasValue.toFixed(1)} EV` : null,
        meteringMode: allData.meteringMode || null,
        flash: FLASH_VALUES[allData.flash] || (allData.flash !== undefined ? `Unknown (${allData.flash})` : null),
        whiteBalance: allData.whiteBalance === 0 ? 'Auto' : allData.whiteBalance === 1 ? 'Manual' : null,
      },

      // Image info
      image: {
        width: allData.pixelXDimension || null,
        height: allData.pixelYDimension || null,
        orientation: ORIENTATIONS[allData.orientation] || null,
        orientationValue: allData.orientation || null,
        colorSpace: allData.colorSpace === 1 ? 'sRGB' : allData.colorSpace === 65535 ? 'Uncalibrated' : null,
      },

      // Date/time
      datetime: {
        original: allData.dateTimeOriginal || null,
        digitized: allData.dateTimeDigitized || null,
        modified: allData.dateTime || null,
      },

      // GPS
      gps: null,
    };

    // Parse GPS if available
    if (allData.gpsLatitude && allData.gpsLongitude) {
      const lat = gpsToDecimal(allData.gpsLatitude, allData.gpsLatitudeRef);
      const lng = gpsToDecimal(allData.gpsLongitude, allData.gpsLongitudeRef);

      if (lat !== null && lng !== null) {
        result.gps = {
          latitude: lat,
          longitude: lng,
          latitudeRef: allData.gpsLatitudeRef || null,
          longitudeRef: allData.gpsLongitudeRef || null,
          altitude: allData.gpsAltitude || null,
          altitudeRef: allData.gpsAltitudeRef === 0 ? 'Above sea level' : allData.gpsAltitudeRef === 1 ? 'Below sea level' : null,
          timestamp: allData.gpsTimeStamp || null,
          datestamp: allData.gpsDateStamp || null,
          googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
        };
      }
    }

    // Clean up null values
    for (const key of Object.keys(result)) {
      if (typeof result[key] === 'object' && result[key] !== null) {
        const hasValues = Object.values(result[key]).some(v => v !== null);
        if (!hasValues) {
          result[key] = null;
        }
      }
    }

    return result;

  } catch (error) {
    return { supported: true, hasExif: false, error: error.message };
  }
}

/**
 * Get a flat summary of key EXIF data for embedding
 * @param {object} exif - EXIF data from extractExif
 * @returns {string} Human-readable summary
 */
export function exifToSummary(exif) {
  if (!exif.hasExif) return '';

  const parts = [];

  if (exif.camera?.make || exif.camera?.model) {
    parts.push(`Camera: ${[exif.camera.make, exif.camera.model].filter(Boolean).join(' ')}`);
  }

  if (exif.lens?.model) {
    parts.push(`Lens: ${exif.lens.model}`);
  } else if (exif.lens?.focalLength) {
    parts.push(`Focal Length: ${exif.lens.focalLength}`);
  }

  const exposure = [];
  if (exif.exposure?.aperture) exposure.push(exif.exposure.aperture);
  if (exif.exposure?.time) exposure.push(exif.exposure.time);
  if (exif.exposure?.iso) exposure.push(`ISO ${exif.exposure.iso}`);
  if (exposure.length) {
    parts.push(`Exposure: ${exposure.join(', ')}`);
  }

  if (exif.datetime?.original) {
    parts.push(`Date: ${exif.datetime.original}`);
  }

  if (exif.gps) {
    parts.push(`Location: ${exif.gps.latitude}, ${exif.gps.longitude}`);
  }

  if (exif.image?.width && exif.image?.height) {
    parts.push(`Size: ${exif.image.width}x${exif.image.height}`);
  }

  return parts.join('\n');
}

/**
 * Get flat metadata object for ChromaDB storage
 * @param {object} exif - EXIF data from extractExif
 * @returns {object} Flat metadata object
 */
export function exifToMetadata(exif) {
  if (!exif.hasExif) return {};

  const meta = {};

  // Camera
  if (exif.camera?.make) meta.camera_make = exif.camera.make;
  if (exif.camera?.model) meta.camera_model = exif.camera.model;

  // Lens
  if (exif.lens?.model) meta.lens_model = exif.lens.model;
  if (exif.lens?.focalLength) meta.focal_length = exif.lens.focalLength;
  if (exif.lens?.focalLength35mm) meta.focal_length_35mm = exif.lens.focalLength35mm;

  // Exposure
  if (exif.exposure?.aperture) meta.aperture = exif.exposure.aperture;
  if (exif.exposure?.apertureValue) meta.aperture_value = exif.exposure.apertureValue;
  if (exif.exposure?.time) meta.shutter_speed = exif.exposure.time;
  if (exif.exposure?.iso) meta.iso = exif.exposure.iso;
  if (exif.exposure?.flash) meta.flash = exif.exposure.flash;

  // Image
  if (exif.image?.width) meta.exif_width = exif.image.width;
  if (exif.image?.height) meta.exif_height = exif.image.height;
  if (exif.image?.orientation) meta.orientation = exif.image.orientation;

  // DateTime
  if (exif.datetime?.original) meta.date_taken = exif.datetime.original;

  // GPS
  if (exif.gps) {
    meta.gps_latitude = exif.gps.latitude;
    meta.gps_longitude = exif.gps.longitude;
    if (exif.gps.altitude) meta.gps_altitude = exif.gps.altitude;
  }

  return meta;
}

export default {
  extractExif,
  exifToSummary,
  exifToMetadata,
};
