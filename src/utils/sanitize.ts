/**
 * Sanitize an ID for safe use in file paths.
 * Only allows alphanumeric characters, hyphens, and underscores.
 * All other characters are replaced with underscores.
 */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Verify that a resolved file path is within the expected base directory.
 * Throws if path traversal is detected.
 */
export function assertWithinDir(resolvedPath: string, baseDir: string): void {
  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error(`Path traversal detected: ${resolvedPath} is outside ${baseDir}`);
  }
}
