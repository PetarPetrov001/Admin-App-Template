import { PrismaClient } from "@prisma/client";
import type { Session } from "@prisma/client";

const prisma = new PrismaClient();

export async function getDefaultShop(): Promise<string> {
  const sessions = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
  });

  if (sessions.length === 0) {
    throw new Error(
      "No stores found in the database. Install the app on a store first.",
    );
  }

  if (sessions.length > 1) {
    const stores = sessions.map((s) => s.shop).join("\n  ");
    throw new Error(
      `Multiple stores found in the database:\n  ${stores}\n\n` +
        `Please specify which store to use with the --shop flag.\n` +
        `Example: npm run gql -- --shop ${sessions[0].shop} '<query>'`,
    );
  }

  return sessions[0].shop;
}

export async function getSession(shop: string): Promise<Session> {
  const sessionId = `offline_${shop}`;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error(
      `No offline session found for ${shop}. ` +
        `Expected session ID: ${sessionId}. ` +
        `Has the app been installed on this store?`,
    );
  }

  return session;
}

export async function getAccessToken(shop: string): Promise<string> {
  const session = await getSession(shop);
  return session.accessToken;
}

export async function listStores(): Promise<string[]> {
  const sessions = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
  });
  return sessions.map((s) => s.shop);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
