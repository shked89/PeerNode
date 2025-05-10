// src/utils/logger.js
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const LOG_FILE =
   process.env.PEERNODE_ERROR_LOG || resolve(process.cwd(), 'error.log');

const maxErrorLines = 3;

/** 
 * Default disk logger: trims stack to 3 lines and appends to error.log
 * @param {Error|string} err
 */
async function defaultDiskLogger(err) {
   let entry;
   if (err instanceof Error) {
      const lines = (err.stack || '').split('\n').slice(0, maxErrorLines);
      if ((err.stack || '').split('\n').length > maxErrorLines) {
         lines.push(`    ... more lines omitted`);
      }
      entry = lines.join('\n');
   } else {
      entry = String(err);
   }
   const line = `[${new Date().toISOString()}] ${entry}\n`;
   await appendFile(LOG_FILE, line);
}
/** 
 * A pluggable error-logging function. 
 * Default: write to disk via `defaultDiskLogger()`.
 * You can override it at runtime with `setLogErrorHandler()`.
 * @param {Error|string} err
 */

export let logError = defaultDiskLogger;
/**
 * Override the global error-logger.
 * @param {(err:Error|string)=>Promise<void>|void} fn
 */

export function setLogErrorHandler(fn) {
   if (typeof fn !== 'function') {
      throw new TypeError('Error handler must be a function');
   }
   logError = fn;
}
