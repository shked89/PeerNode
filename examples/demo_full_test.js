//--- File: examples/demo_full_test.js ---//

import { PeerNode } from '../src/index.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' }); // Sender (API Gateway)
   const ds = new PeerNode({ nodeId: 'n2', service: 'ds' }); // Receiver (DataService)

   await Promise.all([ag.connect(), ds.connect()]);

   // Setup a subscriber to handle incoming player stats update requests
   ds.on('n1/ag/ds/player/stats', async (req) => {
      console.log('DataService received request:', req);
      const { playerId, action } = req;

      // Mock player stats processing
      if (action === 'level_up') {
         return { playerId, newLevel: 43, score: 9050 };
      }

      return { playerId, newLevel: 42, score: 9000 };
   });

   await wait(500); // Give subscriptions time to initialize

   // Send a synchronous GET request
   const payload = { playerId: 42, action: 'level_up' };
   const playerStats = await ag.get('ds/player/stats', payload);
   console.log('API Gateway received response:', playerStats);

   await Promise.all([ag.close(), ds.close()]);
};

main().catch(console.error);
