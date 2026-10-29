"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";
import { withUser, type ActionResult } from "@/server/action-result";
import {
  createAccountLink,
  createUser,
  resetTwoFactor,
  setUserActive,
  updateUser,
} from "@/server/users/service";

// Gestione utenti (solo admin: controllato nel servizio). I link si mostrano all'admin da consegnare a mano.

export interface LinkResult {
  url: string;
  expiresAt: string;
  kind: "invite" | "reset";
}

const roleSchema = z.enum(["ADMIN", "EDITOR", "READER"]);

function userFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    role: roleSchema.parse(String(formData.get("role") ?? "")),
    locationIds: formData.getAll("locationIds").map(String),
  };
}

export async function createUserAction(_previous: ActionResult<LinkResult>, formData: FormData): Promise<ActionResult<LinkResult>> {
  return withUser<LinkResult>("createUser", async (user) => {
    const { link } = await createUser(user, { ...userFields(formData), email: String(formData.get("email") ?? "") });
    revalidatePath("/admin/utenti");
    return { ok: true, data: { url: link.url, expiresAt: link.expiresAt.toISOString(), kind: "invite" }, message: "Utente creato." };
  });
}

export async function updateUserAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("updateUser", async (user) => {
    await updateUser(user, uuidSchema.parse(String(formData.get("userId") ?? "")), userFields(formData));
    revalidatePath("/admin/utenti");
    return { ok: true, data: undefined, message: "Modifiche salvate." };
  });
}

export async function setUserActiveAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("setUserActive", async (user) => {
    const active = String(formData.get("active")) === "true";
    await setUserActive(user, uuidSchema.parse(String(formData.get("userId") ?? "")), active);
    revalidatePath("/admin/utenti");
    return { ok: true, data: undefined, message: active ? "Utente riattivato." : "Utente disattivato: sessioni chiuse." };
  });
}

export async function accountLinkAction(_previous: ActionResult<LinkResult>, formData: FormData): Promise<ActionResult<LinkResult>> {
  return withUser<LinkResult>("accountLink", async (user) => {
    const kind = z.enum(["invite", "reset"]).parse(String(formData.get("kind") ?? ""));
    const link = await createAccountLink(user, uuidSchema.parse(String(formData.get("userId") ?? "")), kind);
    return { ok: true, data: { url: link.url, expiresAt: link.expiresAt.toISOString(), kind } };
  });
}

export async function resetTwoFactorAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return withUser("resetTwoFactor", async (user) => {
    await resetTwoFactor(user, uuidSchema.parse(String(formData.get("userId") ?? "")));
    revalidatePath("/admin/utenti");
    return { ok: true, data: undefined, message: "Verifica in due passaggi azzerata." };
  });
}
