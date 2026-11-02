import type { ExecFileSyncOptions } from "node:child_process";

export const RESTIC_TIMEOUT_MS: number;
export function run(command: string, args: string[], options?: ExecFileSyncOptions): string;
export function wrangler(args: string[], options?: ExecFileSyncOptions): string;
export function restic(args: string[], options?: ExecFileSyncOptions): string;
export function d1Query(sql: string, target: { database: string; remote?: boolean; persistTo?: string; config?: string }): unknown[];
export function log(message: string): void;
