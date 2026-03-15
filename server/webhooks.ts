import express, { Router } from 'express';

import { DeliveryMethod, prisma, shopify } from './shopify.js';

// NOTE: These webhooks only fire while the Express server is running.
// Since the server is only used for the one-time OAuth install, these
// are unlikely to fire in practice. Kept as a safety net in case the
// server happens to be running when the app is uninstalled.
shopify.webhooks.addHandlers({
  APP_UNINSTALLED: [
    {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: '/webhooks',
      callback: async (_topic: string, shop: string) => {
        console.log(`[webhook] app/uninstalled from ${shop} — deleting session`);
        await prisma.session.deleteMany({ where: { shop } });
      },
    },
  ],
});

const router = Router();

router.post('/webhooks', express.text({ type: '*/*' }), async (req, res) => {
  try {
    await shopify.webhooks.process({
      rawBody: req.body as string,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('[webhook] Processing error:', error);
    if (!res.headersSent) {
      res.status(500).send('Webhook processing failed');
    }
  }
});

export default router;
