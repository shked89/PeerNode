export class BusAdapter {
   /**
    * Establish a connection with the underlying message bus.
    */
   async connect() {
      throw new Error('connect() must be implemented by adapter');
   }

   /**
    * Fire‑and‑forget publish.
    */
   async publish(_subject, _message, _options = {}) {
      throw new Error('publish() must be implemented by adapter');
   }

   /**
    * Request‑reply call.
    */
   async request(_subject, _message, _options = {}) {
      throw new Error('request() must be implemented by adapter');
   }

   /**
    * Subscribe to a subject (wildcards are adapter‑specific).
    *
    * @param {string} _subject
    * @param {(data: any, rawMsg: any) => any|Promise<any>} _handler
    */
   subscribe(_subject, _handler) {
      throw new Error('subscribe() must be implemented by adapter');
   }

   /**
    * Gracefully close the connection.
    */
   async close() {
      /* optional */
   }
}
