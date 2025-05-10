// Minimal client for ctx-first NodeRouter demo
// AG – Calls the GC routes synchronously
// ──────────────────────────────────────
import { PeerNode } from '../src/index.js';

const main = async () => {
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });
   await ag.connect();

   // 1) +50 exp
   console.log(await ag.send('post', 'n1/gc/unit/exp/add', {
      unitId: 'U42', exp: 50
   }));

   // 2) +2×30 exp
   console.log(await ag.send('post', 'n1/gc/unit/exp_double/add', {
      unitId: 'U42', exp: 30
   }));

   // 3) health
   console.log(await ag.send('get', 'n1/gc/health'));

   // 4) debug with custom header
   console.log(await ag.send('put', 'n1/gc/debug',
      { foo: 'bar' }, { headers: { 'x-client': 'demo' } })
   );

   await ag.close();
};

main().catch(console.error);