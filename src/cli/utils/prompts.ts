import readline from 'readline';

/**
 * Prompt user for input via readline
 */
export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user for yes/no confirmation
 */
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
  const answer = await prompt(question + suffix);
  
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prompt for selection from numbered menu
 */
export async function select(question: string, choices: string[]): Promise<number> {
  console.log('\n' + question);
  choices.forEach((choice, i) => {
    console.log(`${i + 1}. ${choice}`);
  });
  
  while (true) {
    const answer = await prompt('\nEnter selection (1-' + choices.length + '): ');
    const num = parseInt(answer);
    
    if (num >= 1 && num <= choices.length) {
      return num - 1;
    }
    
    console.log('Invalid selection. Please try again.');
  }
}

/**
 * Pause and wait for Enter key
 */
export async function pause(message = 'Press Enter to continue...'): Promise<void> {
  await prompt(message);
}
