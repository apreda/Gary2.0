import 'dotenv/config';
console.log('1. Script started with dotenv');

async function test() {
  console.log('2. Test function called');
}

test().catch(console.error);

