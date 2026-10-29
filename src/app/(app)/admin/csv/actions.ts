"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser, type ActionResult } from "@/server/action-result";
import { applyImport, previewImport } from "@/server/csv/service";
import type { ImportPlan } from "@/server/csv/plan";
import { DomainError } from "@/server/errors";

// Import CSV (solo admin: controllato dal servizio). Il file viaggia due volte: anteprima, poi import.

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 100;
const modeSchema = z.enum(["add-copy", "skip"]);

export interface ImportReport {
  summary: ImportPlan["summary"];
  errors: ImportPlan["errors"];
  skippedLines: number[];
  applied: boolean;
}

async function readCsvFile(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION", "Scegli un file CSV.");
  if (file.size > MAX_FILE_BYTES) throw new DomainError("VALIDATION", "Il file è troppo grande (massimo 2 MB).");
  return new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
}

function toReport(plan: ImportPlan, applied: boolean): ImportReport {
  return {
    summary: plan.summary,
    errors: plan.errors.slice(0, MAX_ERRORS_SHOWN),
    skippedLines: plan.skipped.map((entry) => entry.line),
    applied,
  };
}

export async function importCsvAction(_previous: ActionResult<ImportReport>, formData: FormData): Promise<ActionResult<ImportReport>> {
  return withUser<ImportReport>("importCsv", async (user) => {
    const text = await readCsvFile(formData);
    const mode = modeSchema.parse(String(formData.get("mode") ?? "add-copy"));
    const isDryRun = formData.get("intent") !== "import";

    if (isDryRun) return { ok: true, data: toReport(await previewImport(user, text, mode), false) };

    const plan = await applyImport(user, text, mode);
    const applied = plan.errors.length === 0;
    if (applied) revalidatePath("/");
    return { ok: true, data: toReport(plan, applied) };
  });
}
