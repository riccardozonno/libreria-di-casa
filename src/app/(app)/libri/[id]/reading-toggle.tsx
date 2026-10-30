"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { setReadingAction } from "./actions";

export function ReadingToggle({ bookId, userId, hasRead }: { bookId: string; userId: string; hasRead: boolean }) {
  const [state, action, isPending] = useActionState(setReadingAction, initialActionState);
  return (
    <form action={action}>
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="read" value={hasRead ? "false" : "true"} />
      <button
        type="submit"
        disabled={isPending}
        aria-pressed={hasRead}
        className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] text-[15px] font-semibold transition-opacity disabled:opacity-60 ${
          hasRead ? "bg-success-soft text-success" : "border border-line bg-surface text-ink"
        }`}
      >
        <span aria-hidden>{hasRead ? "✓" : "○"}</span>
        L&apos;ho letto
      </button>
      {!state.ok && state.error && (
        <p role="alert" className="mt-2 text-[14px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
