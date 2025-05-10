// Demo script for PeerNode communication
import { PeerNode } from '../src/index.js';

const wait = ms => new Promise(res => setTimeout(res, ms));

async function main() {
   const gc = new PeerNode({ nodeId: 'n1', service: 'gc' });
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });

   await Promise.all([gc.connect(), ag.connect()]);

   // Register GET handler
   gc.on('get', '/unit', async (ctx) => {
      console.log('✅ GET handler triggered:', ctx.payload);
      return { method: 'GET' };
   });

   // Register PATCH handler
   gc.on('patch', '/unit', async (ctx) => {
      console.log('✅ PATCH handler triggered:', ctx.payload);
      return { method: 'PATCH' };
   });

   console.log('📌 Routes registered.');
   // Give time for NATS subscription propagation
   await wait(310);

   console.log('gc.routeSet', gc.routeSet);

   console.log('\n🔹 Sending GET /unit');
   const resGet = await ag.send('get', 'n1/gc/unit', { uid: 'U1' });
   console.log('↩️ Response (GET):', resGet);

   console.log('\n🔹 Sending PATCH /unit');
   const resPatch = await ag.send('patch', 'n1/gc/unit', { uid: 'U1', state: 'idle' });
   console.log('↩️ Response (PATCH):', resPatch);

   console.log('\n🔹 Sending POST /unit (should be 503 - NatsError)');
   const resPost = await ag.send('post', 'n1/gc/unit', { uid: 'U1' });
   console.log('↩️ Response (POST):', resPost);

   await Promise.all([ag.close(), gc.close()]);
}

main().catch(console.error);
