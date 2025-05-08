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
      this.nodeId = nodeId;
      this.service = service;
      this.bus = bus;
      this.defaultTimeout = defaultTimeout;
      this.errorHandler = typeof errorHandler === 'function' ? errorHandler : null;
   }

   /* ──────────────── lifecycle ──────────────── */
   async connect() { if (typeof this.bus.connect === 'function') await this.bus.connect(); }
   async close() { if (typeof this.bus.close === 'function') await this.bus.close(); }

   /* ──────────────── sync verbs (await reply) ──────────────── */
   get(url, payload = {}, opts = {}) { return this.#sync('get', url, payload, opts); }
   post(url, payload = {}, opts = {}) { return this.#sync('post', url, payload, opts); }
   put(url, payload = {}, opts = {}) { return this.#sync('put', url, payload, opts); }
   patch(url, payload = {}, opts = {}) { return this.#sync('patch', url, payload, opts); }
   delete(url, payload = {}, opts = {}) { return this.#sync('delete', url, payload, opts); }

   /* ──────────────── async verbs (fire‑and‑forget) ──────────────── */
   set(url, payload = {}, opts = {}) { return this.#async('set', url, payload, opts); }
   call(url, payload = {}, opts = {}) { return this.#async('call', url, payload, opts); }
   flow(url, payload = {}, opts = {}) { return this.#async('flow', url, payload, opts); }

   /**
    * Subscribe to inbound messages.
    * @param {string}   pattern  subject or wildcard pattern.
    * @param {Function} handler  (data, rawMsg)=>any | Promise<any>
    */
   on(pattern, handler) { return this.bus.subscribe(this.#subject(pattern), handler); }

   /* ──────────────── private helpers ──────────────── */

   /** Build absolute NATS subject from a possibly relative URL. */
   #subject(url) {
      if (url.startsWith('n')) return url; // already absolute, e.g. n2/gc/foo
      return `${this.nodeId}/${this.service}/${url.replace(/^\/+/, '')}`;
   }

   /** Common headers for every outgoing message. */
   #makeHeaders(method, expectReply, extra = {}) {
      return {
         method,
         expectReply: expectReply ? '1' : '0',
         from: `${this.nodeId}/${this.service}`,
         traceId: crypto.randomUUID?.() || `${Date.now()}`,
         ...extra
      };
   }

   /**
    * Unified sync request.
    * Supports per‑call `opts.onError(err)` callback.
    */
   #sync(method, url, payload, opts = {}) {
      const headers = this.#makeHeaders(method, true, opts.headers);
      const timeout = opts.timeout ?? this.defaultTimeout;
      return this.bus
         .request(this.#subject(url), payload, { headers, timeout })
         .catch(async (err) => {
            await this.#handleError(err, opts.onError);
            throw err;
         });
   }

   /**
    * Unified async publish (fire‑and‑forget).
    */
   #async(method, url, payload, opts = {}) {
      const headers = this.#makeHeaders(method, false, opts.headers);
      return this.bus
         .publish(this.#subject(url), payload, { headers })
         .catch(async (err) => {
            await this.#handleError(err, opts.onError);
            throw err;
         });
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