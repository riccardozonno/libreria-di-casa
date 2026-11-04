export const BACKUP_TABLES: string[];
export const RETENTION_ARGS: string[];
export function tableExportArgs(options: { remote: boolean; table: string; output: string; database?: string }): string[];
export function dataFileName(table: string): string;
export function isWeeklyCheckDay(date: Date): boolean;
export function compareCounts(expected: Record<string, number>, actual: Record<string, number>): string[];
export function countsQuery(): string;
export interface InvocationRow {
  sum: { requests: number };
  quantiles: { cpuTimeP50: number; cpuTimeP90: number; cpuTimeP99: number; cpuTimeP999: number };
  dimensions: { scriptVersion: string; status: string };
}
export function summarizeInvocations(rows: InvocationRow[]): {
  statuses: Record<string, number>;
  cpuP99Ms: number;
  versions: Array<{ version: string; requests: number; cpuMs: { p50: number; p90: number; p99: number; p999: number } }>;
};
export function evaluateHealth(health: {
  statuses: Record<string, number>;
  cpuP99Ms: number;
  database: { database_size: number; rows_read_24h: number; rows_written_24h: number };
}): string[];
