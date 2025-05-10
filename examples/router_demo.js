// A minimal server
// GC – Game-controller that exposes 4 routes via NodeRouter
// ──────────────────────────────────────────────────────────
import { PeerNode } from '../src/index.js';
import { NodeRouter } from '../src/NodeRouter.js';

const NODE_ID = 'n1';
const SERVICE = 'gc';
const db = Object.create(null);     // poor-man's DB

// helper: pretty print one-liners
function log(ctx, msg, extra = {}) {
   const { traceId, method, url } = ctx;
   console.log(
      `[${traceId}] ${method.toUpperCase().padEnd(1)} ${url.padEnd(3)} -`,
      msg,
      Object.keys(extra).length ? extra : ''
   );
}

const main = async () => {
   const gc = new PeerNode({ nodeId: NODE_ID, service: SERVICE });
   await gc.connect();

   const router = new NodeRouter();

   router
      /* ────── POST /unit/exp/add ────── */
      .use('post', '/unit/exp/add', async (ctx) => {
         const { unitId, exp } = ctx.payload;

         const s = (db[unitId] ??= { level: 1, exp: 0 });
         s.exp += exp;
         while (s.exp >= 100) { s.exp -= 100; s.level++; }

         log(ctx, 'XP added', { unitId, exp, state: s });
         return { unitId, ...s };
      })
      /* ────── POST /unit/exp_double/add ────── */
      .use('post', '/unit/exp_double/add', async (ctx) => {
         const { unitId, exp } = ctx.payload;
         const s = (db[unitId] ??= { level: 1, exp: 0 });
         s.exp += exp * 2;
         while (s.exp >= 100) { s.exp -= 100; s.level++; }

         log(ctx, 'XP doubled', { unitId, exp, state: s });
         return { unitId, ...s };
      })

      /* ────── GET /health ────── */
      .use('get', '/health', ctx => {
         log(ctx, 'health-check');
         return { ok: true };
      })

      // /* ────── * /debug ────── */ TODO
      // .use('*', '/debug', ctx => {
      //    log(ctx, 'debug echo', ctx.payload);
      //    return { echo: ctx.payload };
      // });

   router.apply(gc);
   console.log('GC routes mounted and ready.');
};

main().catch(console.error);