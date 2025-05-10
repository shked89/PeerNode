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

   // GC: business logic via context-first handlers
   gc.on('/unit/exp/add', async (ctx) => {
      const { unitId, exp } = ctx.payload;
      const stats = (db[unitId] ??= { level: 1, exp: 0 });
      stats.exp += exp;

      // every 100 exp → +1 level
      while (stats.exp >= 100) {
         stats.exp -= 100;
         stats.level += 1;
      }
      return { unitId, ...stats };
   });

   gc.on('/unit/expDouble/add', async (ctx) => {
      const { unitId, exp } = ctx.payload;
      const stats = (db[unitId] ??= { level: 1, exp: 0 });

      //exp Double
      stats.exp += exp * 2;
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
   console.log('After +50  exp →', res1);     // { level:1, exp:50 }

   const res2 = await ag.send('post', 'n1/gc/unit/exp/add', {
      unitId: 'U42',
      exp: 70
   });
   console.log('After +70  exp →', res2);     // { level:2, exp:20 }


   const res3 = await ag.send('post', 'n1/gc/unit/expDouble/add', {
      unitId: 'U42',
      exp: 52.5
   });
   console.log('After +105 exp →', res3);     // { level: 3, exp: 25 }

   await Promise.all([ag.close(), gc.close()]);
};

main().catch(console.error);