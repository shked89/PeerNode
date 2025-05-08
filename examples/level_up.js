import { PeerNode } from '../src/index.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

const main = async () => {
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });
   const ds = new PeerNode({ nodeId: 'n1', service: 'ds' });
   await Promise.all([ag.connect(), ds.connect()]);

   ds.on('n1/ds/player/stats', async ({ playerId, action }) => {
      return action === 'level_up'
         ? { playerId, newLevel: 43, score: 9050 }
         : { playerId, newLevel: 42, score: 9000 };
   });

   await wait(500);

   const payload = { playerId: 42, action: 'level_up' };
   const stats = await ag.send('get', 'n1/ds/player/stats', payload);
   console.log('API Gateway received response:', stats);

   await Promise.all([ag.close(), ds.close()]);
};

main().catch(console.error);
