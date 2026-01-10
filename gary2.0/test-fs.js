import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
console.log('.env read successfully');
console.log('Length:', env.length);

