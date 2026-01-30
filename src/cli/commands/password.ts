/**
 * Password Command
 * Manage dashboard password - generate hashes, set new passwords
 */

import bcrypt from 'bcryptjs';
import { CONFIG } from '../../config/settings.js';
import readline from 'readline';

const BCRYPT_ROUNDS = 10;

export async function passwordCommand(options: string[]): Promise<void> {
  const subcommand = options[0]?.toLowerCase();
  
  switch (subcommand) {
    case 'set':
      await setPassword();
      break;
    case 'hash':
      await hashPassword(options[1]);
      break;
    case 'verify':
      await verifyPassword(options[1]);
      break;
    default:
      showPasswordHelp();
  }
}

function showPasswordHelp(): void {
  console.log(`
🔐 Password Management

Usage: whale-scout password <subcommand> [options]

Subcommands:
  set                    Interactively set a new password (prompts for input)
  hash <password>        Generate bcrypt hash from a password
  verify <password>      Check if password matches current stored password

Examples:
  whale-scout password set
  whale-scout password hash MySecurePassword123
  whale-scout password verify admin123

Security Notes:
  - Passwords are hashed using bcrypt with ${BCRYPT_ROUNDS} rounds
  - Hashed passwords in .env start with $2a$, $2b$, or $2y$
  - Plain text passwords are still supported for backward compatibility
  - Always use hashed passwords in production!

Current Password Type: ${detectPasswordType()}
`);
}

/**
 * Detect if current password is hashed or plain text
 */
function detectPasswordType(): string {
  const password = CONFIG.DASHBOARD_PASSWORD;
  if (password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$')) {
    return 'Hashed (bcrypt)';
  }
  return 'Plain text (consider using "whale-scout password set" to secure it)';
}

/**
 * Check if a string is a bcrypt hash
 */
export function isBcryptHash(str: string): boolean {
  return str.startsWith('$2a$') || str.startsWith('$2b$') || str.startsWith('$2y$');
}

/**
 * Interactive password setting
 */
async function setPassword(): Promise<void> {
  console.log('\n🔐 Set New Dashboard Password\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };
  
  try {
    const password = await question('Enter new password: ');
    
    if (!password || password.length < 6) {
      console.error('\n❌ Password must be at least 6 characters long.');
      rl.close();
      process.exit(1);
    }
    
    const confirm = await question('Confirm password: ');
    
    if (password !== confirm) {
      console.error('\n❌ Passwords do not match.');
      rl.close();
      process.exit(1);
    }
    
    // Generate hash
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    console.log('\n✅ Password hash generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Add this to your .env file:\n');
    console.log(`DASHBOARD_PASSWORD=${hash}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Instructions:');
    console.log('  1. Open your .env file');
    console.log('  2. Replace the DASHBOARD_PASSWORD line with the above');
    console.log('  3. Restart the bot/dashboard for changes to take effect');
    console.log('');
    
  } finally {
    rl.close();
  }
}

/**
 * Generate hash from command line argument
 */
async function hashPassword(password?: string): Promise<void> {
  if (!password) {
    console.error('❌ Please provide a password to hash.');
    console.error('   Usage: whale-scout password hash <password>');
    process.exit(1);
  }
  
  if (password.length < 6) {
    console.error('❌ Password must be at least 6 characters long.');
    process.exit(1);
  }
  
  console.log('\n🔐 Generating password hash...\n');
  
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Add this to your .env file:\n');
  console.log(`DASHBOARD_PASSWORD=${hash}`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Verify a password against current stored password
 */
async function verifyPassword(password?: string): Promise<void> {
  if (!password) {
    console.error('❌ Please provide a password to verify.');
    console.error('   Usage: whale-scout password verify <password>');
    process.exit(1);
  }
  
  console.log('\n🔐 Verifying password...\n');
  
  const stored = CONFIG.DASHBOARD_PASSWORD;
  let isValid = false;
  
  if (isBcryptHash(stored)) {
    // Compare against bcrypt hash
    isValid = await bcrypt.compare(password, stored);
    console.log(`Password type: Hashed (bcrypt)`);
  } else {
    // Plain text comparison
    isValid = password === stored;
    console.log(`Password type: Plain text`);
  }
  
  if (isValid) {
    console.log('✅ Password is VALID - matches stored password\n');
  } else {
    console.log('❌ Password is INVALID - does not match stored password\n');
    process.exit(1);
  }
}
