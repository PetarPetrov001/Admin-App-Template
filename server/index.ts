import express from 'express';

import authRouter from './auth.js';
import webhookRouter from './webhooks.js';

const app = express();

app.use(authRouter);
app.use(webhookRouter);

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);

  const { prisma } = await import('./shopify.js');
  const sessionCount = await prisma.session.count();

  if (sessionCount === 0) {
    console.log(
      "\nNo installations found. Install the app via the install link from your app's Distribution page in the Partners dashboard.",
    );
  } else {
    console.log(
      `\nApp already installed on ${sessionCount} store(s). No need to run the server unless you need to update the access scopes`,
    );
  }
});
