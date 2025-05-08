import { PeerNode } from '../src/index.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

const main = async () => {
   // GC – game-controller
   const gc = new PeerNode({ nodeId: 'n1', service: 'gc' });

   // AG – api-gateway
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });

   // open connections in parallel
   await Promise.all([gc.connect(), ag.connect()]);

   /* ---------- GC: business logic ---------- */
   const db = {};               // simple "in-memory DB"

   // gc.on('n1/gc/unit/exp/add', ...
   // OR 
   gc.on('/unit/exp/add', async ({ unitId, exp }) => {
      const stats = (db[unitId] ??= { level: 1, exp: 0 });
      stats.exp += exp;

      // every 100 exp → +1 level
      while (stats.exp >= 100) {
         stats.exp -= 100;
         stats.level += 1;
      }
      return { unitId, ...stats };
   });

   await wait(100); // let the subscriber take 

   /* ---------- AG: we send requests ---------- */
   const res1 = await ag.send('post', 'n1/gc/unit/exp/add', {
      unitId: 'U42',
      exp: 50
   });
   console.log('After +50 exp →', res1);     // { level:1, exp:50 }

   const res2 = await ag.send('post', 'n1/gc/unit/exp/add', {
      unitId: 'U42',
      exp: 70
   });
   console.log('After +70 exp →', res2);     // { level:2, exp:20 }

   await Promise.all([ag.close(), gc.close()]);
};

main().catch(console.error);