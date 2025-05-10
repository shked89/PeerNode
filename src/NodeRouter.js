// A tiny declarative router for PeerNode
// ───────────────────────────────────────
export class NodeRouter {
   /**
    * A NodeRouter keeps a 2-level lookup table:
    *   { [url]: { [method]: handler } }
    */
   constructor() {
      /** @type {Record<string, Record<string, Function>>} */
      this.routes = Object.create(null);
   }

   /**
    * Register a handler for a (method, url) pair.
    *
    * @param {string} method  – case-insensitive
    * @param {string} url     – must start with "/", relative to the peer prefix
    * @param {(ctx:object)=>any|Promise<any>} handler
    * @return {NodeRouter}    – for chaining
    */
   use(method, url, handler) {
      method = String(method).toLowerCase();
      url = String(url).toLowerCase();
      if (typeof handler !== 'function') {
         throw new TypeError('Handler must be a function');
      }
      if (!url.startsWith('/')) {
         throw new Error('URL must start with "/" (relative form)');
      }
      if (!this.routes[url]) {
         this.routes[url] = Object.create(null);
      }

      this.routes[url][method] = handler;
      return this;
   }

   /**
    * Attach every registered route to a PeerNode instance.
    *
    * @param {import('./PeerNode.js').PeerNode} peer
    */
   apply(peer) {
      for (const url of Object.keys(this.routes)) {
         const table = this.routes[url];
         for (const method of Object.keys(table)) {
            const handler = table[method];

            peer.on(method, url, (payload, msg) => {
               // Build lightweight context object
               const ctx = {
                  url,                          // "/unit/exp/add"
                  subject: msg.subject,         // "n1/gc/unit/exp/add"
                  method: msg.headers?.get('method') ?? '*',
                  headers: Object.fromEntries(msg.headers ?? []),
                  traceId: msg.headers?.get('traceId'),
                  payload,                      // payload data
                  raw: msg,
                  /** Helper for manual replies (rarely used) */
                  reply: (data, hdr = {}) =>
                     msg.reply && peer.bus.publish(msg.reply, data, { headers: hdr }),
               };

               /* Invoke the user handler – ctx-first API */
               return handler(ctx);
            });
         }
      }
   }
}