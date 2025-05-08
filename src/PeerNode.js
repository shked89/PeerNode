import crypto from 'node:crypto';
import { BusAdapter } from './adapters/BusAdapter.js';
import { NatsAdapter } from './adapters/NatsAdapter.js';
import { logError } from './utils/logger.js';

/**
 * PeerNode – faсade over a message bus providing REST‑like verbs (sync)
 * and event verbs (async). Default transport is pure NATS but any
 * adapter implementing `BusAdapter` may be injected.
 */
export class PeerNode {
   /**
    * @param {object}  opts
    * @param {string}  opts.nodeId        logical node identifier, e.g. "n1"
    * @param {string}  opts.service       service alias, e.g. "ag" | "gc" | "ds"
    * @param {BusAdapter} [opts.bus]      custom bus adapter (defaults to NATS)
    * @param {number}  [opts.defaultTimeout=1000]   request timeout (ms)
    * @param {function} [opts.errorHandler]         global async error callback
    */
   constructor({ nodeId, service, bus = new NatsAdapter(), defaultTimeout = 1_000, errorHandler = null }) {
      if (!nodeId || !service) throw new Error('nodeId and service are required');
      Object.assign(this, { nodeId, service, bus, defaultTimeout });
      this.errorHandler = typeof errorHandler === 'function' ? errorHandler : null;
   }
   
      /* ──────────────── lifecycle ──────────────── */
      async connect() { if (typeof this.bus.connect === 'function') await this.bus.connect(); }
      async close() { if (typeof this.bus.close === 'function') await this.bus.close(); }
   

   /* ───────────── unified verb ───────────── */
   /**
    * @param {"get"|"post"|"put"|"patch"|"delete"|"set"|"call"|"flow"} method
    * @param {string} url n<id>/<service>/<path>
    * @param {any} [payload]
    * @param {object} [opts]
    */
   send(method, url, payload = {}, opts = {}) {
      method = String(method).toLowerCase();
      const syncVerbs = new Set(['get', 'post', 'put', 'patch', 'delete']);
      const asyncVerbs = new Set(['set', 'call', 'flow']);

      if (syncVerbs.has(method)) return this.#sync(method, url, payload, opts);
      if (asyncVerbs.has(method)) return this.#async(method, url, payload, opts);
      throw new Error(`Unknown verb "${method}"`);
   }

   /* ───────────── subscriptions ───────────── */
   on(pattern, handler) { return this.bus.subscribe(pattern, handler); }

   /* ───────────── private helpers ───────────── */

   #assertAbsolute(url) {
      if (!/^n\d+\/[A-Za-z0-9_-]+\/.+/.test(url)) {
         throw new Error(`URL must be absolute (format n<id>/<service>/path), got "${url}"`);
      }
      return url;
   }

   #makeHeaders(method, expectReply, extra = {}) {
      return {
         method,
         expectReply: expectReply ? '1' : '0',
         from: `${this.nodeId}/${this.service}`,
         traceId: crypto.randomUUID?.() || `${Date.now()}`,
         ...extra
      };
   }

   #sync(method, url, payload, opts) {
      const headers = this.#makeHeaders(method, true, opts.headers);
      const timeout = opts.timeout ?? this.defaultTimeout;
      return this.bus.request(this.#assertAbsolute(url), payload, { headers, timeout })
         .catch(err => this.#handleError(err, opts.onError));
   }

   #async(method, url, payload, opts) {
      const headers = this.#makeHeaders(method, false, opts.headers);
      return this.bus.publish(this.#assertAbsolute(url), payload, { headers })
         .catch(err => this.#handleError(err, opts.onError));
   }

   /**
    * Centralised error handler.
    * Priority order:
    *   1. per‑call `opts.onError`
    *   2. instance‑level `this.errorHandler`
    *   3. fallback async file logger (error.log)
    * Always swallows its own errors to avoid infinite loops.
    */
   async #handleError(err, localHandler) {
      try {
         if (typeof localHandler === 'function') return await localHandler(err);
         if (typeof this.errorHandler === 'function') return await this.errorHandler(err);
         await logError(err);
      } catch { /* noop */ }
   }
}