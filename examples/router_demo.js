// A minimal node
// ────────────────────────────────────────
import { PeerNode } from '../src/index.js';
import { NodeRouter } from '../src/NodeRouter.js';

const main = async () => {
   const NODE_ID = 'n1'
   const SERVICE_ID = 'gc'
   const node = new PeerNode({ nodeId: NODE_ID, service: SERVICE_ID });
   await node.connect();

   /* -------- build routing table -------- */
   const router = new NodeRouter();

   router
      .use('post', '/unit/exp/add', async (ctx, { unitId, exp }) => {
         console.log('post', '/unit/exp/add', unitId, exp);
         /* … business logic … */
         return { status: 'ok', url: '/unit/exp/add' }
      })
      .use('post', '/unit/expDouble/add', async (ctx, { unitId, exp }) => {
         console.log('post', '/unit/expDouble/add', unitId, exp);
         /* … business logic … */
         return { status: 'ok', url: '/unit/expDouble/add' }
      })
      .use('get', '/health', () => ({ status: 'ok' }))
      .use('*', '/debug', (ctx, { foo }) => ({ echo: foo }));

   /* -------- bind to PeerNode -------- */
   router.apply(node);

   console.log(`Routes mounted. ${SERVICE_ID.toUpperCase()} is ready.`);
};

main().catch(console.error);
