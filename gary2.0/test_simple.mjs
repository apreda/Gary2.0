import 'dotenv/config';
console.log('ESM works, env loaded');
console.log('SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'Found' : 'Missing');
