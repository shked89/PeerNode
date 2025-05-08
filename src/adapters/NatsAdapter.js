//////////////////// src/adapters/NatsAdapter.js ////////////////////
import { connect, StringCodec, headers as natsHeaders } from 'nats';
import { logError } from '../utils/logger.js';
import { BusAdapter } from './BusAdapter.js';

/**
 * NATS implementation of BusAdapter.
 * Uses JSON payloads and NATS headers for metadata.
 */
export class NatsAdapter extends BusAdapter {
   constructor(connectionOptions = {}) {
      super();
      this.connectionOptions = connectionOptions;
      this.sc = StringCodec();
   }

   async connect() {
      this.nc = await connect(this.connectionOptions);
   }

   /* ---------- helpers ---------- */

   encode(obj) {
      return this.sc.encode(JSON.stringify(obj));
   }

   decode(bin) {
      return JSON.parse(this.sc.decode(bin));
   }

   buildHeaders(map = {}) {
      const h = natsHeaders();
      for (const [k, v] of Object.entries(map)) {
         h.set(k, String(v));
      }
      return h;
   }

   /* ---------- adapter contract ---------- */

   async publish(subject, message, { headers } = {}) {
      try {
         this.nc.publish(subject, this.encode(message), {
            headers: this.buildHeaders(headers)
         });
      } catch (err) {
         return logError(err);
      }
   }

   async request(subject, message, { timeout = 1_000, headers } = {}) {
      try {
         const rep = await this.nc.request(subject, this.encode(message), {
            timeout,
            headers: this.buildHeaders(headers)
         });
         return this.decode(rep.data);
      } catch (err) {
         await logError(err);
         throw err;
      }
   }

   subscribe(subject, handler) {
      const sub = this.nc.subscribe(subject);
      (async () => {
         for await (const msg of sub) {
            const data = this.decode(msg.data);
            const res = await handler(data, msg);
            if (msg.reply && res !== undefined) {
               this.nc.publish(msg.reply, this.encode(res));
            }
         }
      })().catch(console.error);
      return sub;
   }

   async close() {
      await this.nc.drain();
   }
}