import { HttpResponseError } from '@shopify/shopify-api';
import { Router } from 'express';

import { pageAlreadyInstalled, pageInstallExpired, pageInstallSuccess } from './pages.js';
import { sessionStorage, shopify } from './shopify.js';

// Utils
function isStaleAuthCode(error: unknown): boolean {
  if (!(error instanceof HttpResponseError) || error.response.code !== 400) return false;
  const body = error.response.body as Record<string, string> | undefined;
  return (
    body?.error === 'invalid_request' &&
    (body?.error_description ?? '').includes('authorization code')
  );
}

// Routing
const router = Router();

router.get('/', async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const { shop: rawShop, hmac } = query;

  // No hmac = not a Shopify-initiated request
  if (!rawShop || !hmac) {
    res.status(403).send('Forbidden.');
    return;
  }

  const shop = shopify.utils.sanitizeShop(rawShop, true);
  if (!shop) {
    res.status(400).send('Invalid shop parameter.');
    return;
  }

  // Verify the request actually came from Shopify
  const validHmac = await shopify.utils.validateHmac(query as Record<string, string>);
  if (!validHmac) {
    console.warn(`[install] Invalid HMAC for shop: ${shop}`);
    res.status(403).send('Invalid request.');
    return;
  }

  const session = await sessionStorage.loadSession(`offline_${shop}`);

  if (!session) {
    console.log(`[install] No session for ${shop} — starting OAuth`);
    res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    return;
  }

  console.log(`[install] App already installed on ${shop}`);
  res.send(pageAlreadyInstalled(shop, session.scope ?? '(none)'));
});

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

    res.send(pageInstallSuccess(callback.session.shop, callback.session.scope ?? '(none)'));
  } catch (error) {
    if (isStaleAuthCode(error)) {
      const shop = req.query.shop as string | undefined;
      const existing = shop ? await sessionStorage.loadSession(`offline_${shop}`) : null;

      if (existing) {
        console.log(`[auth] Stale callback — app already installed on ${existing.shop}`);
        res.send(pageAlreadyInstalled(existing.shop, existing.scope ?? '(none)'));
      } else {
        console.warn(`[auth] Stale auth code — no session found for shop: ${shop}`);
        res.status(400).send(pageInstallExpired());
      }
      return;
    }

    console.error('[auth] Callback error:', error);
    res.status(500).send('OAuth callback failed. Check server logs.');
  }
});

export default router;
