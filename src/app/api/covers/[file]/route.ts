import { getCurrentUser } from "@/server/actor";
import { readCover } from "@/server/covers/storage";

// Copertine: solo per utenti con sessione valida. I nomi sono UUID immutabili → cache lunga ma privata.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  // Stessa regola delle pagine: un admin senza 2FA in produzione vede solo il profilo.
  if (user.mustEnable2fa) return new Response(null, { status: 403 });
  const { file } = await params;
  const bytes = await readCover(file);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
