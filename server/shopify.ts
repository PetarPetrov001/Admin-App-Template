import {
  shopifyApi,
  ApiVersion,
  DeliveryMethod,
} from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export const sessionStorage = new PrismaSessionStorage(prisma);

const appUrl =
  process.env.HOST ?? process.env.APP_URL ?? process.env.SHOPIFY_APP_URL ?? "";

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SCOPES?.split(",") ?? [],
  hostName: appUrl.replace(/^https?:\/\//, ""),
  hostScheme: "https",
  apiVersion: ApiVersion.July25,
  isEmbeddedApp: false,
});

export { DeliveryMethod, appUrl };
