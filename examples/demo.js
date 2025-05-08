import { PeerNode } from '../src/index.js';

const main = async () => {
   // API Gateway service, node "n1"
   const ag = new PeerNode({ nodeId: 'n1', service: 'ag' });
   await ag.connect();

   // notify GameCore that a unit is moving
   await ag.set('gc/unit/go', {
      unitIds: ['Gdsg5s.yGuh3'],
      type: 'go',
      toI: 315,
      toJ: 615
   });

   // fetch some data from DataService synchronously
   const playerStats = await ag.get('ds/player/42/stats');
   console.log('Player stats:', playerStats);

   await ag.close();
};

main().catch(console.error);