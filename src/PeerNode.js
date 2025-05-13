import crypto from 'node:crypto';
import { BusAdapter } from './adapters/BusAdapter.js';
import { NatsAdapter } from './adapters/NatsAdapter.js';
import { logError } from './utils/logger.js';

// ───────────── constants ─────────────
const ALL_SYNC_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ALL_ASYNC_METHODS = [
   'start', 'step', 'finish', 'fail', 'cancel', // like state machine
   'call', 'emit', 'stream'
];

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
   constructor({ nodeId, service, bus = new NatsAdapter(), defaultTimeout = 10_000, errorHandler = null }) {
      if (!nodeId || !service) throw new Error('nodeId and service are required');
      this.nodeId = String(nodeId).toLowerCase();
      this.service = String(service).toLowerCase();
      Object.assign(this, { bus, defaultTimeout });
      this.errorHandler = typeof errorHandler === 'function' ? errorHandler : null;

      // Track registered method+path combinations
      this.routeSet = new Set();
      this.routeBaseSet = new Set();
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
      url = String(url).toLowerCase();
      if (ALLOWED_METHODS.has(method)) {
         return this.#async(method, url, payload, opts);
      }
      // if (ALLOWED_ASYNC_METHODS.has(method)) {
      //    return this.#async(method, url, payload, opts);
      // }
      throw new Error(`Unknown verb "${method}"`);
   }

   /**
    * Internal handler for incoming messages.
    * Builds a context (`ctx`) from raw data and invokes the registered route handler.
    *
    * Handles:
    * - Reply expectation
    * - Route existence check
    * - Centralized error handling
    *
    * @param {any} data - Parsed message payload
    * @param {any} rawMsg - Original NATS message object
    * @param {string} prefix - Subject prefix (e.g., "n1/gc")
    * @param {Function} handler - Registered handler for the route
    * @param {object} params - skipRouteCheck
    */
   async #onMsg(data, rawMsg, prefix, handler, params = {}) {
      const headers = {};
      const skipRouteCheck = params?.skipRouteCheck

      if (rawMsg?.headers) {
         for (const key of rawMsg.headers.keys()) {
            headers[key] = rawMsg.headers.get(key);
         }
      }
      const subject = rawMsg.subject

      // Build context object
      const ctx = {
         // url: headers.url.replace(prefix, ''),
         url: subject.replace(prefix, ''),
         subject: subject,
         method: headers.method,
         headers: headers,
         expectReply: headers.expectReply,
         traceId: headers.traceId,
         payload: this.parsePayload(data),
         raw: rawMsg,
         reply: (response, hdr = {}) =>
            rawMsg.reply && this.bus.publish(rawMsg.reply, response, { headers: hdr }),
      };

      const routeKey = subject;

      // If this route is not registered at all - 405
      if (!skipRouteCheck && !this.routeSet.has(routeKey)) {
         let errMsg = '';
         if (rawMsg.reply && headers?.expectReply === '1') {
            const headers = this.#makeHeaders('error', false, { res: 405 });
            await this.bus.publish(rawMsg.reply, { error: errMsg }, { headers });
         }
         return logError(errMsg);
      }

      // One matching method should process the request
      try {
         return await handler(ctx);
      } catch (err) {
         await this.#handleError(err);
         if (rawMsg.reply && rawMsg.headers?.get('expectReply') === '1') {
            const headers = this.#makeHeaders('error', false, { res: 500 });
            return { error: err.message ?? 'Internal server error' };
         }
      }
   }

   /**
    * getRouteURLs
    * @param {string} [method]
    * @param {string} [pattern]
    * @returns {object}  { prefix, prefix_url, prefix_url_method }
    */
   #getRouteURLs(method, pattern) {
      const prefix = `${this.nodeId}/${this.service}`.toLowerCase(); // "n1/gc"
      const prefix_url = pattern.startsWith('/') ? `${prefix}${pattern}` : pattern

      if (!prefix_url.startsWith(prefix)) {
         console.error(
            `[PeerNode] Illegal subscription to foreign subject "${pattern}". ` +
            `This node is "${prefix}". Exiting.`,
         );
         process.exit(1);
      }

      const prefix_url_method = method === '*' ? `${prefix_url}--all` : `${prefix_url}--${method}`

      if (this.routeSet.has(prefix_url_method)) {
         console.error(
            "ERROR! This method has been registered! " + prefix_url_method
         );
         process.exit(1);
      }

      return { prefix, prefix_url, prefix_url_method }
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
      // Overload resolution: (pattern, handler) or (method, pattern, handler)
      let verb = '*', pattern, handler;
      if (typeof patternOrHandler === 'function') {
         pattern = methodOrPattern;
         handler = patternOrHandler;
      } else {
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
      pattern = pattern.toLowerCase();

      // Normalize to absolute subject
      const { prefix, prefix_url, prefix_url_method } = this.#getRouteURLs(verb, pattern);

      let subject;
      if (verb === '*') {
         // Subscribe with wildcard to match all verbs
         // subject = `${prefix_url}-->`;                 // real NATS subject to listen
         // this.routeSet.add(`${prefix_url}--all`);      // register route key

         throw new Error(
            `Wildcard method "*" is not supported in peer.on(). Use peer.onExternal("${prefix_url}-->", handler) instead.`
         );
      } else {
         subject = prefix_url_method;
         this.routeSet.add(subject);
      }

      // Subscribe and wrap data+msg into a single ctx
      this.bus.subscribe(subject, async (data, rawMsg) => {
         return this.#onMsg(data, rawMsg, prefix, handler);
      });

      return this;
   }

   /**
    * Normalize incoming payload into a plain object.
    *
    * - If `data` is a non-null object (including arrays), returns it unchanged.
    * - Otherwise wraps the original primitive or missing value under `{ raw: … }`.
    *   - `null` or `undefined` become `{ raw: null }`.
    *   - Numbers, strings, booleans become `{ raw: 42 }`, `{ raw: "foo" }`, etc.
    *
    * @param {*} data  The raw payload received from the bus.
    * @returns {object}  A guaranteed object for `ctx.payload`.
    */
   parsePayload(data) {
      return data != null && typeof data === 'object' ? data : { raw: (data !== undefined ? data : null) }
   }

   /**
    * Explicitly subscribe to a *foreign* subject.  Use with care.
    *
    * @param {string} pattern   absolute NATS subject, wildcards allowed
    * @param {function} handler
    */
   onExternal(pattern, handler) {
      pattern = String(pattern).toLowerCase();

      // Subscribe and wrap into ctx via #onMsg skip route-set validation.
      this.bus.subscribe(pattern, async (data, rawMsg) => {
         return this.#onMsg(data, rawMsg, '', handler, {
            skipRouteCheck: true
         });
      });

      return this;
   }

   #assertAbsolute(url) {
      if (!/^n\d+\/[A-Za-z0-9_-]+\/.+/.test(url)) {
         throw new Error(`URL must be absolute (format n<id>/<service>/path), got "${url}"`);
      }
      return url;
   }

   #makeHeaders(method, expectReply, url, extra = {}) {
      if (extra?.method) {
         console.warn('⚠️ Overriding method in headers:', extra.method);
      }
      return {
         method,
         url,
         expectReply: expectReply ? '1' : '0',
         from: `${this.nodeId}/${this.service}`,
         traceId: crypto.randomUUID?.() || `${Date.now()}`,
         ...extra
      };
   }

   /**
    * Internal method to perform a request-reply interaction over the bus.
    * 
    * Constructs headers and invokes `bus.request()` on a derived subject.
    * Automatically calls error handler if request fails.
    *
    * @param {string} method - HTTP-like method (e.g., "get", "patch")
    * @param {string} url - Fully qualified subject (e.g., "n1/gc/unit")
    * @param {any} payload - Message body
    * @param {object} opts - Optional settings like timeout, headers, onError
    * @returns {Promise<any>} Response or error wrapper
    */
   async #async(method, url, payload, opts) {
      const headers = this.#makeHeaders(method, true, url, opts.headers);
      const timeout = opts.timeout ?? this.defaultTimeout;
      const fullUrl = `${this.#assertAbsolute(url)}--${method}`;
      return await this.bus.request(fullUrl, payload, { headers, timeout })
         .catch(err => {
            this.#handleError(err, opts.onError)
            return { res: parseInt(err.code || 500, 10) }
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