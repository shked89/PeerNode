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
    * @param {"get"|"post"|"put"|"patch"|"delete"|"*"} method – case-insensitive
    * @param {string} url  – starts with "/", relative to the peer prefix
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
         for (const [method, fn] of methods) {
            peer.on(method, url, fn);
         }
      }
   }
}