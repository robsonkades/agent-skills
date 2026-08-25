export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  /** Stable identifier, e.g. `manifest.name.mismatch`. Used in tests and docs. */
  readonly rule: string;
  /** Dotted path into the document, or a file path. */
  readonly at: string;
  readonly message: string;
  /** Concrete fix, when there is an obvious one. */
  readonly hint?: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

export function buildReport(issues: readonly ValidationIssue[]): ValidationReport {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { ok: errors.length === 0, issues, errors, warnings };
}

/** Small helper so validators read as a list of rules rather than a list of pushes. */
export class IssueCollector {
  private readonly issues: ValidationIssue[] = [];

  error(rule: string, at: string, message: string, hint?: string): void {
    this.add('error', rule, at, message, hint);
  }

  warn(rule: string, at: string, message: string, hint?: string): void {
    this.add('warning', rule, at, message, hint);
  }

  info(rule: string, at: string, message: string, hint?: string): void {
    this.add('info', rule, at, message, hint);
  }

  private add(
    severity: IssueSeverity,
    rule: string,
    at: string,
    message: string,
    hint?: string,
  ): void {
    const issue: ValidationIssue =
      hint === undefined ? { severity, rule, at, message } : { severity, rule, at, message, hint };
    this.issues.push(issue);
  }

  absorb(issues: readonly ValidationIssue[]): void {
    this.issues.push(...issues);
  }

  all(): readonly ValidationIssue[] {
    return this.issues;
  }

  report(): ValidationReport {
    return buildReport(this.issues);
  }
}
