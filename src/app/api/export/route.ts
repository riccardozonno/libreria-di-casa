import { uuidSchema } from "@/lib/schemas";
import { getCurrentUser } from "@/server/actor";
import { exportCsv } from "@/server/csv/service";
import { DomainError } from "@/server/errors";

// Download del CSV (solo admin: controllato da exportCsv). ?sede=<id> per una sola sede.
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });

  const sede = new URL(request.url).searchParams.get("sede");
  if (sede && !uuidSchema.safeParse(sede).success) return new Response("Sede non valida", { status: 400 });

  try {
    const csv = await exportCsv(user, sede);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="home-library-${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") return new Response(error.message, { status: 403 });
    throw error;
  }
}
