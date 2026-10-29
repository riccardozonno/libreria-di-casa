"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";
import { withUser, type ActionResult } from "@/server/action-result";
import { createLocation, setLocationArchived, updateLocation } from "@/server/locations/service";

// Gestione sedi (solo admin: il controllo è nel servizio).

function locationFields(formData: FormData): { name: string; color: string } {
  return { name: String(formData.get("name") ?? ""), color: String(formData.get("color") ?? "") };
}

export async function createLocationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("createLocation", async (user) => {
    await createLocation(user, locationFields(formData));
    revalidatePath("/sedi");
    return { ok: true, data: undefined, message: "Sede creata." };
  });
}

export async function updateLocationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("updateLocation", async (user) => {
    const id = uuidSchema.parse(String(formData.get("id") ?? ""));
    await updateLocation(user, id, locationFields(formData));
    revalidatePath("/sedi");
    revalidatePath("/");
    return { ok: true, data: undefined, message: "Sede aggiornata." };
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
