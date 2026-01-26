/**
 * Data Integrity Utilities for Offline Template Export/Import
 * Provides checksum generation, verification, and row count validation
 */

/**
 * Generate a simple checksum from binary data using CRC32-like algorithm
 * Fast and reliable for detecting data corruption
 */
export function generateChecksum(data: Uint8Array): string {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

/**
 * Verify checksum of binary data
 */
export function verifyChecksum(data: Uint8Array, expectedChecksum: string): boolean {
  const actualChecksum = generateChecksum(data);
  return actualChecksum === expectedChecksum;
}

/**
 * Export metadata with integrity information
 */
export interface ExportMetadata {
  version: string;
  exportedAt: string;
  checksum: string;
  templateCount: number;
  sectionCount: number;
  costItemCount: number;
  fileSizeBytes: number;
}

/**
 * Create export metadata with checksum
 */
export function createExportMetadata(
  dbData: Uint8Array,
  templateCount: number,
  sectionCount: number,
  costItemCount: number
): ExportMetadata {
  return {
    version: '2.0', // New version with integrity checks
    exportedAt: new Date().toISOString(),
    checksum: generateChecksum(dbData),
    templateCount,
    sectionCount,
    costItemCount,
    fileSizeBytes: dbData.length,
  };
}

/**
 * Validate import metadata and data integrity
 */
export function validateImport(
  meta: ExportMetadata,
  dbData: Uint8Array
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check version compatibility
  const versionNum = parseFloat(meta.version || '1.0');
  if (versionNum < 1.0) {
    errors.push('Unknown export version');
  }

  // Check file size matches
  if (meta.fileSizeBytes && dbData.length !== meta.fileSizeBytes) {
    errors.push(`File size mismatch: expected ${meta.fileSizeBytes} bytes, got ${dbData.length} bytes`);
  }

  // Verify checksum (v2.0+)
  if (meta.checksum) {
    if (!verifyChecksum(dbData, meta.checksum)) {
      errors.push('Checksum verification failed - file may be corrupted');
    }
  }

  // Basic sanity checks
  if (meta.templateCount !== undefined && meta.templateCount < 0) {
    errors.push('Invalid template count');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify database contents match expected counts
 */
export function verifyDatabaseCounts(
  db: any,
  expectedTemplates: number,
  expectedSections: number,
  expectedCostItems: number
): { valid: boolean; details: { templates: number; sections: number; costItems: number }; errors: string[] } {
  const errors: string[] = [];
  
  let actualTemplates = 0;
  let actualSections = 0;
  let actualCostItems = 0;

  try {
    const tResult = db.exec('SELECT COUNT(*) FROM templates');
    actualTemplates = tResult[0]?.values[0]?.[0] as number || 0;
    
    const sResult = db.exec('SELECT COUNT(*) FROM sections');
    actualSections = sResult[0]?.values[0]?.[0] as number || 0;
    
    const cResult = db.exec('SELECT COUNT(*) FROM cost_items');
    actualCostItems = cResult[0]?.values[0]?.[0] as number || 0;
  } catch (err) {
    errors.push('Failed to query database for verification');
    return { valid: false, details: { templates: 0, sections: 0, costItems: 0 }, errors };
  }

  // Validate counts
  if (expectedTemplates !== undefined && actualTemplates !== expectedTemplates) {
    errors.push(`Template count mismatch: expected ${expectedTemplates}, found ${actualTemplates}`);
  }
  
  if (expectedSections !== undefined && actualSections !== expectedSections) {
    errors.push(`Section count mismatch: expected ${expectedSections}, found ${actualSections}`);
  }
  
  if (expectedCostItems !== undefined && actualCostItems !== expectedCostItems) {
    errors.push(`Cost item count mismatch: expected ${expectedCostItems}, found ${actualCostItems}`);
  }

  return {
    valid: errors.length === 0,
    details: { templates: actualTemplates, sections: actualSections, costItems: actualCostItems },
    errors,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Estimate export time based on data size (for Surface performance)
 */
export function estimateExportTime(costItemCount: number): string {
  // ~500 cost items per second on a Surface device
  const seconds = Math.ceil(costItemCount / 500);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m`;
}
