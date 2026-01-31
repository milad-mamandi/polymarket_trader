import { db } from './database.js';

/**
 * Get runtime configuration from database (overrides .env values)
 */
export function getRuntimeConfig(): Record<string, string> {
  try {
    const stmt = db.prepare('SELECT key, value FROM app_config');
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    return config;
  } catch (error) {
    // Table might not exist yet, return empty object
    return {};
  }
}

/**
 * Set/update a runtime configuration value
 */
export function setRuntimeConfigValue(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET 
      value = excluded.value,
      updated_at = datetime('now')
  `);
  stmt.run(key, value);
}

/**
 * Set multiple runtime configuration values
 */
export function setRuntimeConfigValues(updates: Record<string, string>): void {
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET 
      value = excluded.value,
      updated_at = datetime('now')
  `);
  
  const insertMany = db.transaction((rows: Array<[string, string]>) => {
    for (const [key, value] of rows) {
      stmt.run(key, value);
    }
  });
  
  const rows = Object.entries(updates);
  insertMany(rows);
}
