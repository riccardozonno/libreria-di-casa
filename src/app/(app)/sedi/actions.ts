"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";
import { withUser, type ActionResult } from "@/server/action-result";
import { createLocation, renameLocation, setLocationArchived } from "@/server/locations/service";

// Gestione sedi (solo admin: il controllo è nel servizio).

export async function createLocationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("createLocation", async (user) => {
    await createLocation(user, String(formData.get("name") ?? ""));
    revalidatePath("/sedi");
    return { ok: true, data: undefined, message: "Sede creata." };
  });
}

export async function renameLocationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("renameLocation", async (user) => {
    const id = uuidSchema.parse(String(formData.get("id") ?? ""));
    await renameLocation(user, id, String(formData.get("name") ?? ""));
    revalidatePath("/sedi");
    return { ok: true, data: undefined, message: "Sede rinominata." };
  });
}

const archiveSchema = z.object({ id: uuidSchema, archived: z.enum(["true", "false"]).transform((value) => value === "true") });

export async function setArchivedAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("setLocationArchived", async (user) => {
    const input = archiveSchema.parse({ id: String(formData.get("id") ?? ""), archived: String(formData.get("archived") ?? "") });
    await setLocationArchived(user, input.id, input.archived);
    revalidatePath("/sedi");
    revalidatePath("/");
    return { ok: true, data: undefined, message: input.archived ? "Sede archiviata." : "Sede riattivata." };
  });
}
