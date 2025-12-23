import {
  PrismaClient as PortalPrismaClientGenerator,
  Prisma as PortalPrisma,
  PrismaClient as PortalClient,
} from "../../prisma/generated/portal";
import {
  PrismaClient as EBPrismaClientGenerator,
  Prisma as EBPrisma,
  PrismaClient as EBClient,
} from "../../prisma/generated/eb";

let portalPrismaClient: PortalPrismaClientGenerator;
let ebPrismaClient: EBPrismaClientGenerator;

export const getPortalPrismaClient = async () => {
  if (portalPrismaClient) {
    return portalPrismaClient;
  }
  //for Dev
  const dbUrl = `${process.env.DATABASE_URL}&connection_limit=300`;
  portalPrismaClient = new PortalPrismaClientGenerator({
    // log: ["query"],
    // log: ["query", "info", "warn", "error"],
    datasources: { db: { url: dbUrl } },
  });
  return portalPrismaClient as PortalPrismaClientGenerator;
};

export const getEBPrismaClient = async () => {
  if (ebPrismaClient) {
    return ebPrismaClient;
  }
  const dbUrl = process.env.EB_DATABASE_URL;

  ebPrismaClient = new EBPrismaClientGenerator({
    datasources: { db: { url: dbUrl } },
  });

  return ebPrismaClient as EBClient;
};

export type { PortalPrisma, PortalClient, EBPrisma, EBClient };
