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
    * Apply all registered routes to a PeerNode instance.
    *
    * For each (method, url) pair, it calls `peer.on(...)`
    * so that the node starts listening to appropriate subjects.
    *
    * @param {import('./PeerNode.js').PeerNode} peer - The target PeerNode instance
    */
   apply(peer) {
      for (const url of Object.keys(this.routes)) {
         const table = this.routes[url];
         for (const method of Object.keys(table)) {
            const handler = table[method];
            peer.on(method, url, handler);
         }
      }
   }
   
}