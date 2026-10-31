export const BACKUP_TABLES: string[];
export const RETENTION_ARGS: string[];
export function exportArgs(options: { remote: boolean; output: string; database?: string }): string[];
export function isWeeklyCheckDay(date: Date): boolean;
export function compareCounts(expected: Record<string, number>, actual: Record<string, number>): string[];
export function countsQuery(): string;
export function evaluateHealth(health: {
  statuses: Record<string, number>;
  cpuP99Ms: number;
  database: { database_size: number; rows_read_24h: number; rows_written_24h: number };
}): string[];
