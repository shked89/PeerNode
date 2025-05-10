// AG → DS "player stats" request
// ─────────────────────────────────
import { PeerNode } from '../src/index.js';
import { setLogErrorHandler } from '../src/utils/logger.js';

// Custom error logger 
setLogErrorHandler(err => {
   console.error('📣 CustomLog:', err);
});

const main = async () => {
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });
   const ds = new PeerNode({ nodeId: 'n1', service: 'ds' });
   await Promise.all([ag.connect(), ds.connect()]);

   // DS handles GET /player/stats with a single ctx
   ds.on('get', '/player/stats', (ctx) => {
      const { playerId, action } = ctx.payload;
      console.log(
         `[${ctx.traceId}] GET /player/stats → playerId=${playerId}, action=${action}`
      );

      if (!playerId || !action) {
         return { error: 'Missing playerId or action' };
      }

      return action === 'level_up'
         ? { playerId, newLevel: 43, score: 9050 }
         : { playerId, newLevel: 42, score: 9000 };
   });

   // wait for subscription to be active 
   await new Promise(r => setTimeout(r, 100));

   const stats = await ag.send('get', 'n1/ds/player/stats', {
      playerId: 42,
      action: 'level_up',
   });

   console.log('AG received:', stats);
   await Promise.all([ag.close(), ds.close()]);
};

main().catch(console.error);