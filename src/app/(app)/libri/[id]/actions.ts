"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copyDetailsSchema, uuidSchema } from "@/lib/schemas";
import { withUser, type ActionResult } from "@/server/action-result";
import { addCopy, deleteCopy, moveCopy, updateCopy } from "@/server/catalog/mutations";
import { setReading } from "@/server/catalog/readings";

// Azioni della scheda libro. Ogni azione: zod → utente dal DB → servizio (policy + transazione + audit).

const copyFormSchema = copyDetailsSchema.extend({ copyId: uuidSchema });
const addCopyFormSchema = copyDetailsSchema.extend({ bookId: uuidSchema, locationId: uuidSchema });
const moveFormSchema = z.object({ copyId: uuidSchema, locationId: uuidSchema });
const readingFormSchema = z.object({
  bookId: uuidSchema,
  userId: uuidSchema,
  read: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function fields(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

export async function updateCopyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("updateCopy", async (user) => {
    const input = copyFormSchema.parse(fields(formData, ["copyId", "shelf", "notes"]));
    const { bookId } = await updateCopy(user, input.copyId, { shelf: input.shelf, notes: input.notes });
    revalidatePath(`/libri/${bookId}`);
    return { ok: true, data: undefined, message: "Copia aggiornata." };
  });
}

export async function deleteCopyAction(
  _previous: ActionResult<{ bookDeleted: boolean }>,
  formData: FormData,
): Promise<ActionResult<{ bookDeleted: boolean }>> {
  return withUser("deleteCopy", async (user) => {
    const copyId = uuidSchema.parse(String(formData.get("copyId") ?? ""));
    const result = await deleteCopy(user, copyId);
    revalidatePath("/");
    if (!result.bookDeleted) revalidatePath(`/libri/${result.bookId}`);
    return { ok: true, data: { bookDeleted: result.bookDeleted }, message: result.bookDeleted ? "Libro eliminato." : "Copia eliminata." };
  });
}

export async function addCopyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("addCopy", async (user) => {
    const input = addCopyFormSchema.parse(fields(formData, ["bookId", "locationId", "shelf", "notes"]));
    await addCopy(user, input.bookId, { locationId: input.locationId, copy: { shelf: input.shelf, notes: input.notes } });
    revalidatePath(`/libri/${input.bookId}`);
    revalidatePath("/");
    return { ok: true, data: undefined, message: "Copia aggiunta." };
  });
}

export async function setReadingAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("setReading", async (user) => {
    const input = readingFormSchema.parse(fields(formData, ["bookId", "userId", "read"]));
    await setReading(user, input.bookId, input.userId, input.read);
    revalidatePath(`/libri/${input.bookId}`);
    return { ok: true, data: undefined };
  });
}

export async function moveCopyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("moveCopy", async (user) => {
    const input = moveFormSchema.parse(fields(formData, ["copyId", "locationId"]));
    const { bookId } = await moveCopy(user, input.copyId, input.locationId);
    revalidatePath(`/libri/${bookId}`);
    revalidatePath("/");
    return { ok: true, data: undefined, message: "Copia spostata." };
  });
}
