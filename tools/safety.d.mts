export interface SafetyProblem {
  level: 'block' | 'warn';
  where: string;
  what: string;
}
export interface SafetyResult {
  ok: boolean;
  problems: SafetyProblem[];
}
export function checkLibrarySafety(lib: unknown, sizeBytes?: number): SafetyResult;
export function safetyReport(r: SafetyResult): string[];
