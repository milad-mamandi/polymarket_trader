/**
 * Stop Command
 * Stops all running Whale Scout instances (PM2 and standalone)
 */

import { execSync } from 'child_process';
import { CONFIG } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';

interface ProcessInfo {
  pid: number;
  command: string;
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

function findProcessByPort(port: number): ProcessInfo | null {
  try {
    let output: string;
    
    if (isWindows()) {
      // Windows: Use netstat to find process by port
      output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // Unix/Linux/macOS: Use lsof or ss
      try {
        output = execSync(`lsof -t -i:${port} -sTCP:LISTEN`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // Fallback to ss command
        output = execSync(`ss -tlnp | grep :${port}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
    }

    if (!output || output.trim() === '') {
      return null;
    }

    if (isWindows()) {
      // Parse Windows netstat output: "TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345"
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(pid)) {
          return { pid, command: 'unknown' };
        }
      }
    } else {
      // Unix: lsof returns PID directly, ss needs parsing
      const pid = parseInt(output.trim().split('\n')[0], 10);
      if (!isNaN(pid)) {
        return { pid, command: 'unknown' };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function findWhaleScoutProcesses(): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  
  try {
    let output: string;
    
    if (isWindows()) {
      // Windows: Use wmic or tasklist with filters
      try {
        output = execSync('wmic process where "CommandLine like \'%whale-scout%\'" get ProcessId,CommandLine /format:csv 2>nul', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Parse CSV output
        const lines = output.trim().split('\n').slice(1); // Skip header
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const pid = parseInt(parts[parts.length - 1].trim(), 10);
            if (!isNaN(pid) && pid !== process.pid) {
              processes.push({ pid, command: parts.slice(0, -1).join(',') });
            }
          }
        }
      } catch {
        // Fallback to tasklist
        output = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Note: tasklist doesn't show command line, so we can't filter by whale-scout
        // This is less precise but better than nothing
      }
    } else {
      // Unix/Linux/macOS
      try {
        output = execSync('ps aux | grep -E "(whale-scout|tsx.*src/cli)" | grep -v grep', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        const lines = output.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1], 10);
          if (!isNaN(pid) && pid !== process.pid) {
            processes.push({ pid, command: parts.slice(10).join(' ') });
          }
        }
      } catch {
        // No processes found
      }
    }
  } catch {
    // Ignore errors
  }
  
  return processes;
}

function stopPm2Process(projectName: string): boolean {
  try {
    // Check if PM2 is installed
    execSync('which pm2', { stdio: 'pipe' });
    
    // Check if process exists in PM2
    const list = execSync('pm2 list', { encoding: 'utf-8', stdio: 'pipe' });
    if (!list.includes(projectName)) {
      return false;
    }
    
    // Stop and delete from PM2
    execSync(`pm2 stop ${projectName} 2>/dev/null || true`, { stdio: 'pipe' });
    execSync(`pm2 delete ${projectName} 2>/dev/null || true`, { stdio: 'pipe' });
    return true;
  } catch {
    // PM2 not installed or other error
    return false;
  }
}

function killProcess(pid: number, force: boolean): boolean {
  try {
    if (isWindows()) {
      if (force) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
      } else {
        execSync(`taskkill /PID ${pid}`, { stdio: 'pipe' });
      }
    } else {
      if (force) {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
      } else {
        execSync(`kill -TERM ${pid}`, { stdio: 'pipe' });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function stopCommand(options: string[]): Promise<void> {
  const force = options.includes('--force') || options.includes('-f');
  const quiet = options.includes('--quiet') || options.includes('-q');
  
  if (!quiet) {
    console.log('🛑 Stopping Whale Scout...\n');
  }
  
  let stoppedCount = 0;
  
  // 1. Try to stop PM2 managed processes
  if (!quiet) {
    console.log('Checking for PM2 processes...');
  }
  
  const pm2Stopped = stopPm2Process('whale-scout');
  if (pm2Stopped) {
    if (!quiet) {
      console.log('✅ Stopped PM2 process: whale-scout');
    }
    stoppedCount++;
  } else if (!quiet) {
    console.log('  No PM2 process found');
  }
  
  // 2. Find and stop processes by port
  const port = CONFIG.DASHBOARD_PORT;
  if (!quiet) {
    console.log(`\nChecking for processes on port ${port}...`);
  }
  
  const portProcess = findProcessByPort(port);
  if (portProcess) {
    if (!quiet) {
      console.log(`  Found process on port ${port} (PID: ${portProcess.pid})`);
    }
    
    if (killProcess(portProcess.pid, force)) {
      if (!quiet) {
        console.log(`✅ Killed process ${portProcess.pid}`);
      }
      stoppedCount++;
      
      // Wait a moment to ensure process is fully terminated
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify the port is now free
      const stillRunning = findProcessByPort(port);
      if (stillRunning && force) {
        // Try force kill again
        killProcess(portProcess.pid, true);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } else if (!quiet) {
      console.log(`❌ Failed to kill process ${portProcess.pid}`);
    }
  } else if (!quiet) {
    console.log(`  No process found on port ${port}`);
  }
  
  // 3. Find and stop standalone whale-scout processes
  if (!quiet) {
    console.log('\nChecking for standalone processes...');
  }
  
  const standaloneProcesses = findWhaleScoutProcesses();
  if (standaloneProcesses.length > 0) {
    for (const proc of standaloneProcesses) {
      if (!quiet) {
        console.log(`  Found process (PID: ${proc.pid})`);
      }
      
      if (killProcess(proc.pid, force)) {
        if (!quiet) {
          console.log(`✅ Killed process ${proc.pid}`);
        }
        stoppedCount++;
      } else if (!quiet) {
        console.log(`❌ Failed to kill process ${proc.pid}`);
      }
    }
  } else if (!quiet) {
    console.log('  No standalone processes found');
  }
  
  // Summary
  if (!quiet) {
    console.log('\n' + '='.repeat(50));
    if (stoppedCount > 0) {
      console.log(`✅ Stopped ${stoppedCount} Whale Scout instance(s)`);
    } else {
      console.log('ℹ️  No running Whale Scout instances found');
    }
    console.log('='.repeat(50));
  }
  
  // Log for debugging
  logger.info(`Stop command completed. Stopped ${stoppedCount} instance(s). Force: ${force}`);
}
