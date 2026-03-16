import express from 'express';

import authRouter from './auth.js';
import { appUrl } from './shopify.js';
import webhookRouter from './webhooks.js';

const app = express();

app.use(authRouter);
app.use(webhookRouter);

app.get('/', (req, res) => {
  const shop = req.query.shop as string | undefined;
  if (shop) {
    res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    return;
  }
  res.send('Shopify Admin API App is running.');
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);

  // Check if any sessions exist to show relevant guidance
  const { prisma } = await import('./shopify.js');
  const sessionCount = await prisma.session.count();

  if (sessionCount === 0) {
    console.log(
      '\nNo installations found. Install the app via the install link from your app\'s Distribution page in the Partners dashboard.',
    );
  } else {
    console.log(`\nApp already installed on ${sessionCount} store(s).`);
  }
});
