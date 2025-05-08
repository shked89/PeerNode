import crypto from 'node:crypto';
import { BusAdapter } from './adapters/BusAdapter.js';
import { NatsAdapter } from './adapters/NatsAdapter.js';
import { logError } from './utils/logger.js';

// ───────────── constants ─────────────
const ALL_SYNC_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ALL_ASYNC_METHODS = ['set', 'call', 'flow', 'note'];

const ALLOWED_SYNC_METHODS = new Set(ALL_SYNC_METHODS);
const ALLOWED_ASYNC_METHODS = new Set(ALL_ASYNC_METHODS);
const ALLOWED_METHODS = new Set([...ALL_SYNC_METHODS, ...ALL_ASYNC_METHODS, '*']);

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
      if (ALLOWED_SYNC_METHODS.has(method)) {
         return this.#sync(method, url, payload, opts);
      }
      if (ALLOWED_ASYNC_METHODS.has(method)) {
         return this.#async(method, url, payload, opts);
      }
      throw new Error(`Unknown verb "${method}"`);
   }

   /* ───────────── subscriptions ───────────── */
   /**
    * Subscribe to a subject.
    *
    * Overloads:
    *    on(pattern, handler)                       – legacy, matches every verb
    *    on(method, pattern, handler)               – verb-aware
    *
    * Both forms accept *relative* patterns that start with "/".
    * A relative pattern is automatically expanded to:  n<id>/<service>/<pattern>.
    * If a caller tries to subscribe to a foreign subject unintentionally
    * (absolute path that does **not** start with this node’s prefix) the
    * process terminates – this is almost certainly a configuration error.
    *
    * @param {string} methodOrPattern   – verb or pattern depending on overload
    * @param {string|function} [patternOrHandler]
    * @param {function} [maybeHandler]
    * @returns {any}  adapter-specific subscription object
    */
   on(methodOrPattern, patternOrHandler, maybeHandler) {
      /* ---------- overload resolution ---------- */
      let verb = '*';                  // "*" = match any verb
      let pattern;
      let handler;

      if (typeof patternOrHandler === 'function') {
         // Legacy form: on(pattern, handler)
         pattern = methodOrPattern;
         handler = patternOrHandler;
      } else {
         // Verb-aware form: on(verb, pattern, handler)
         verb = String(methodOrPattern).toLowerCase();
         if (!ALLOWED_METHODS.has(verb)) {
            throw new Error(`Unknown verb "${verb}" for on()`);
         }
         pattern = patternOrHandler;
         handler = maybeHandler;
         if (typeof handler !== 'function') {
            throw new Error('Handler function is required');
         }
      }

      /* ---------- pattern normalisation ---------- */
      const selfPrefix = `${this.nodeId}/${this.service}`;
      if (pattern.startsWith('/')) {
         // Relative form → expand to absolute
         pattern = `${selfPrefix}${pattern}`;
      }

      /* ---------- safety check ---------- */
      if (!pattern.startsWith(selfPrefix)) {
         // The user *probably* made a mistake – hard fail is safer.
         console.error(
            `[PeerNode] Illegal subscription to foreign subject "${pattern}". ` +
            `This node is "${selfPrefix}". Shutting down.`,
         );
         process.exit(1);
      }

      /* ---------- subscribe via bus ---------- */
      this.bus.subscribe(pattern, async (data, rawMsg) => {
         // Determine requested verb from headers (absent → “*”)
         const reqVerb = rawMsg.headers?.get('method')?.toLowerCase?.() || '*';

         if (verb !== '*' && verb !== reqVerb) {
            // Wrong verb – reply with error (if a reply is expected) and log.
            const errMsg = `Method ${reqVerb.toUpperCase()} not allowed for ${pattern}`;
            if (rawMsg.reply && rawMsg.headers?.get('expectReply') === '1') {
               // Use our own makeHeaders helper so traceId stays consistent.
               const headers = this.#makeHeaders('error', false, { status: 405 });
               await this.bus.publish(rawMsg.reply, { error: errMsg }, { headers });
            }
            await logError(errMsg);
            return;
         }

         try {
            return await handler(data, rawMsg);
         } catch (err) {
            await this.#handleError(err);
            if (rawMsg.reply && rawMsg.headers?.get('expectReply') === '1') {
               const headers = this.#makeHeaders('error', false, { status: 500 });
               return { error: err.message ?? 'Internal server error' };
            }
         }
      });

      return this;
   }

   /**
    * Explicitly subscribe to a *foreign* subject.  Use with care.
    *
    * @param {string} pattern   absolute NATS subject, wildcards allowed
    * @param {function} handler
    */
   onExternal(pattern, handler) {
      if (!/^n\d+\/[A-Za-z0-9_-]+\/.+/.test(pattern)) {
         throw new Error(
            `External pattern must be absolute (n<id>/<service>/path), got "${pattern}"`
         );
      }
      this.bus.subscribe(pattern, handler);
      return this
   }

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