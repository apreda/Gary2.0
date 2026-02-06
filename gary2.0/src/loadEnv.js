/**
 * Centralized environment variable loader.
 * Import this as a side-effect at the top of any script:
 *   import '../src/loadEnv.js';
 *
 * Loads .env first, then .env.local with override (local values win).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local'), override: true });
