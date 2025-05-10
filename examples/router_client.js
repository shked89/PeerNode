// A minimal client
// ────────────────────────────────────────
import { PeerNode } from '../src/index.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

const main = async () => {
   // AG – API-gateway node
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });
   await ag.connect();

   // Give the GC node a moment to finish mounting routes
   await wait(250);

   /* ---------- synchronous calls ---------- */

   // 1. Add 50 XP to unit U42
   const res1 = await ag.send('post', 'n1/gc/unit/exp/add', {
      unitId: 'U42',
      exp: 50
   });
   console.log('POST /unit/exp/add  →', res1);

   // 2. Add double XP (2 × 30)
   const res2 = await ag.send('post', 'n1/gc/unit/expDouble/add', {
      unitId: 'U42',
      exp: 30
   });
   console.log('POST /unit/expDouble/add →', res2);

   // 3. Health-check
   const health = await ag.send('get', 'n1/gc/health');
   console.log('GET  /health →', health);

   // 4. Debug route (verb-agnostic, method wildcard)
   const debug = await ag.send('put', 'n1/gc/debug', { foo: 'bar' });
   console.log('PUT  /debug  →', debug);

   await ag.close();
};

main().catch(console.error);
