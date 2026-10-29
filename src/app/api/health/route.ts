import { prisma } from "@/server/db";

// Healthcheck del container (compose.yaml): risponde 200 solo se il database è raggiungibile.
// Non espone dettagli: l'errore finisce nei log del server.
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[health] database non raggiungibile", error);
    return Response.json({ status: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
