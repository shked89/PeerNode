// src/utils/logger.js
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const LOG_FILE =
   process.env.PEERNODE_ERROR_LOG || resolve(process.cwd(), 'error.log');

/**
 * Asynchronously append an error (or any stringable value) to the log file.
 *
 * @param {Error|string} err
 */
export async function logError(err) {
   const line =
      `[${new Date().toISOString()}] ` +
      (err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err) +
      '\n';

   try {
      await appendFile(LOG_FILE, line);  // fs.promises is non-blocking :contentReference[oaicite:0]{index=0}
   } catch (e) {
      // If logging itself fails we fall back to stderr to avoid recursion.
      console.error('[peernode-logger] write failed:', e);
   }
}
