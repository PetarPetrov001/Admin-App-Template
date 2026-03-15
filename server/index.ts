import express from "express";
import { appUrl } from "./shopify.js";
import authRouter from "./auth.js";
import webhookRouter from "./webhooks.js";

const app = express();

app.use(authRouter);
app.use(webhookRouter);

app.get("/", (req, res) => {
  const shop = req.query.shop as string | undefined;
  if (shop) {
    res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    return;
  }
  res.send("Shopify Admin API App is running.");
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (appUrl) {
    console.log(`Auth URL: ${appUrl}/auth?shop=YOUR_STORE.myshopify.com`);
  }
});
