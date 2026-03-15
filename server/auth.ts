import { Router } from 'express';

import { sessionStorage, shopify } from './shopify.js';

const router = Router();

router.get('/auth', async (req, res) => {
  const shop = shopify.utils.sanitizeShop(req.query.shop as string, true);
  if (!shop) {
    res.status(400).send('Missing or invalid shop parameter.');
    return;
  }

  await shopify.auth.begin({
    shop,
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

router.get('/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    await sessionStorage.storeSession(callback.session);

    console.log(
      `[auth] Installed on ${callback.session.shop} — token stored (session ${callback.session.id})`,
    );

    res.send('App installed successfully. You can close this window.');
  } catch (error) {
    console.error('[auth] Callback error:', error);
    res.status(500).send('OAuth callback failed. Check server logs.');
  }
});

export default router;
