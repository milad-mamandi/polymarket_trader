import fs from 'fs';
import path from 'path';

/**
 * Read .env file and parse into key-value pairs
 */
export function readEnvFile(envPath: string): Map<string, string> {
  const envMap = new Map<string, string>();
  
  if (!fs.existsSync(envPath)) {
    return envMap;
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    envMap.set(key, value);
  }
  
  return envMap;
}

/**
 * Write environment variables to .env file
 */
export function writeEnvFile(envPath: string, envMap: Map<string, string>): void {
  const lines: string[] = [];
  
  // Read existing file to preserve comments and order
  let existingContent = '';
  if (fs.existsSync(envPath)) {
    existingContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  const existingLines = existingContent.split('\n');
  const processedKeys = new Set<string>();
  
  // Process existing lines, updating values as needed
  for (const line of existingLines) {
    const trimmed = line.trim();
    
    // Keep comments and empty lines as-is
    if (!trimmed || trimmed.startsWith('#')) {
      lines.push(line);
      continue;
    }
    
    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      lines.push(line);
      continue;
    }
    
    const key = trimmed.substring(0, eqIndex).trim();
    
    if (envMap.has(key)) {
      const newValue = envMap.get(key)!;
      // Quote value if it contains spaces
      const quotedValue = newValue.includes(' ') ? `"${newValue}"` : newValue;
      lines.push(`${key}=${quotedValue}`);
      processedKeys.add(key);
    } else {
      lines.push(line);
    }
  }
  
  // Add any new keys that weren't in the original file
  for (const [key, value] of envMap.entries()) {
    if (!processedKeys.has(key)) {
      const quotedValue = value.includes(' ') ? `"${value}"` : value;
      lines.push(`${key}=${quotedValue}`);
    }
  }
  
  // Write back to file
  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
}

/**
 * Update a single environment variable
 */
export function updateEnvVar(envPath: string, key: string, value: string): void {
  const envMap = readEnvFile(envPath);
  envMap.set(key, value);
  writeEnvFile(envPath, envMap);
}

/**
 * Get .env file path (defaults to project root)
 */
export function getEnvPath(): string {
  return path.join(process.cwd(), '.env');
}
