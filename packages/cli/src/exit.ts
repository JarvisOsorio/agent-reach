/**
 * Documented CLI exit codes:
 * | 0 | Success |
 * | 1 | Not found / already decided / business miss |
 * | 2 | Invalid input / schema / integrity failure |
 * | 3 | Infrastructure / storage error |
 */
export const EXIT = {
  OK: 0,
  NOT_FOUND: 1,
  INVALID: 2,
  INFRA: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
