import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'gary2.0', '.env') });
dotenv.config({ path: path.join(__dirname, 'gary2.0', '.env.local'), override: true });

const API_KEY = process.env.BALL_DONT_LIE_API_KEY;

async function test() {
  try {
    const url = 'https://api.balldontlie.io/nhl/v1/player_injuries';
    console.log(`Fetching from ${url}...`);
    const resp = await axios.get(url, {
      headers: { Authorization: API_KEY }
    });
    console.log('Success! Found', resp.data.data.length, 'injuries');
    console.log('First 2:', JSON.stringify(resp.data.data.slice(0, 2), null, 2));
  } catch (e) {
    console.error('Error:', e.response?.status, e.response?.data || e.message);
  }
}

test();
