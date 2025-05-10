// A tiny declarative router for PeerNode
// ───────────────────────────────────────
export class NodeRouter {
   /**
    * A NodeRouter keeps a 2-level lookup table:
    *   Map<url, Map<method, callback>>
    */
   constructor() {
      /** @type {Map<string, Map<string, Function>>} */
      this.routes = new Map();
   }

   /**
    * Register a handler for a (method, url) pair.
    *
    * @param {string} method - case-insensitive
    * @param {string} url  - starts with "/", relative to the peer prefix
    * @param {(data:any, rawMsg:any)=>any|Promise<any>} handler
    * @returns {NodeRouter}  for chaining
    */
   use(method, url, handler) {
      method = String(method).toLowerCase();
      if (typeof handler !== 'function') {
         throw new TypeError('Handler must be a function');
      }
      if (!url.startsWith('/')) {
         throw new Error('URL must start with "/" (relative form)');
      }

      if (!this.routes.has(url)) {
         this.routes.set(url, new Map());
      }
      this.routes.get(url).set(method, handler);
      return this;
   }

   /**
    * Attach every registered route to a PeerNode instance.
    *
    * @param {import('./PeerNode.js').PeerNode} peer
    */
   apply(peer) {
      for (const [url, methods] of this.routes) {
         for (const [method, handler] of methods) {
            peer.on(method, url, (payload, msg) => {
               // Build lightweight context
               const ctx = {
                  url,                          // "/unit/exp/add"
                  subject: msg.subject,         // "n1/gc/unit/exp/add"
                  method: msg.headers?.get('method') ?? '*',
                  headers: Object.fromEntries(msg.headers ?? []),
                  traceId: msg.headers?.get('traceId'),
                  payload,                      // alias for convenience
                  raw: msg,
                  reply: (data, hdr = {}) =>
                     msg.reply &&
                     peer.bus.publish(msg.reply, data, { headers: hdr }),
               };

               // Call user handler: (ctx) or (ctx, payload)
               return handler.length >= 2
                  ? handler(ctx, payload) // ctx, payload
                  : handler(ctx);         // ctx only
            });
         }
      }
   }
}