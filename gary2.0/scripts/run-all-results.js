const { spawn } = require('child_process');
const path = require('path');

async function runScript(scriptPath, args = []) {
  console.log(`\n🚀 Running: node ${scriptPath} ${args.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    const process = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptPath} completed successfully.`);
        resolve();
      } else {
        console.error(`❌ ${scriptPath} failed with exit code ${code}.`);
        reject(new Error(`${scriptPath} failed`));
      }
    });
  });
}

async function main() {
  const dateArg = process.argv[2];
  
  // Use current date if no date provided
  let date;
  if (dateArg) {
    date = dateArg;
  } else {
    // Default to yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    date = d.toISOString().split('T')[0];
  }

  console.log(`=======================================================`);
  console.log(`   GARY 2.0 UNIFIED RESULTS PROCESSOR - ${date}`);
  console.log(`=======================================================`);

  try {
    // 1. Run Game Results (Standard Daily)
    await runScript(path.join(__dirname, 'run-results-for-date.js'), [date]);
    
    // 2. Run Prop Results
    await runScript(path.join(__dirname, 'run-prop-results-for-date.js'), [date]);

    console.log(`\n✨ ALL RESULTS PROCESSED FOR ${date} ✨`);
  } catch (error) {
    console.error(`\n💥 Error processing results:`, error.message);
    process.exit(1);
  }
}

main();

