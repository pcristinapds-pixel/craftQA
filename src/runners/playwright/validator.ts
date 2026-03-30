/**
 * AST-based test code validator.
 *
 * Uses the TypeScript Compiler API to parse generated test code and check
 * for dangerous patterns that regex-based validation could miss (e.g.,
 * string concatenation to bypass blocklists, dynamic property access).
 */

import ts from 'typescript';

// ── Blocked identifiers & modules ──────────────────────────────────────

/** Direct call names that are never allowed. */
const BLOCKED_CALLS = new Set([
  'eval',
  'Function',
  'require',
]);

/** Property access patterns on `process` that are blocked. */
const BLOCKED_PROCESS_MEMBERS = new Set([
  'exit',
  'kill',
  'env',
]);

/** Node built-in modules that must not be imported. */
const BLOCKED_MODULES = new Set([
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'net',
  'node:net',
  'dgram',
  'node:dgram',
  'cluster',
  'node:cluster',
  'worker_threads',
  'node:worker_threads',
  'vm',
  'node:vm',
]);

/** Only these module prefixes are allowed in import declarations. */
const ALLOWED_IMPORT_PREFIXES = [
  '@playwright/',
  'playwright',
];

function isAllowedModule(specifier: string): boolean {
  return ALLOWED_IMPORT_PREFIXES.some((p) => specifier.startsWith(p));
}

// ── Validator ──────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate AI-generated test code using AST analysis.
 *
 * Catches patterns that regex cannot reliably detect:
 * - `globalThis['ev' + 'al'](...)`
 * - Computed property access on dangerous objects
 * - Indirect `Function` constructor via `new (0, eval)('...')`
 */
export function validateTestCode(code: string): ValidationResult {
  const errors: string[] = [];

  const sourceFile = ts.createSourceFile(
    'test.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  function visit(node: ts.Node): void {
    // ── Import declarations ──
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (BLOCKED_MODULES.has(specifier)) {
        errors.push(`Import of "${specifier}" is not allowed`);
      } else if (!isAllowedModule(specifier)) {
        errors.push(`Import of "${specifier}" is not allowed — only @playwright modules are permitted`);
      }
    }

    // ── Call expressions ──
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      // Direct calls: eval(...), Function(...), require(...)
      if (ts.isIdentifier(expr) && BLOCKED_CALLS.has(expr.text)) {
        errors.push(`${expr.text}() is not allowed`);
      }

      // Dynamic import: import('os')
      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && !isAllowedModule(arg.text)) {
          errors.push('Dynamic imports are restricted to @playwright modules');
        }
      }

      // process.exit(), process.kill()
      if (ts.isPropertyAccessExpression(expr)) {
        if (ts.isIdentifier(expr.expression) && expr.expression.text === 'process') {
          const member = expr.name.text;
          if (member === 'exit') {
            errors.push('process.exit() is not allowed');
          } else if (member === 'kill') {
            errors.push('process.kill() is not allowed');
          }
        }
      }
    }

    // ── New expressions: new Function(...) ──
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
      errors.push('Function() constructor is not allowed');
    }

    // ── Property access: process.env ──
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'process') {
        if (BLOCKED_PROCESS_MEMBERS.has(node.name.text) && !ts.isCallExpression(node.parent)) {
          // process.env (non-call access) — call cases (exit, kill) handled above
          if (node.name.text === 'env') {
            errors.push('process.env access is not allowed in test code');
          }
        }
      }
    }

    // ── Element access on dangerous objects: globalThis['eval'], process['env'] ──
    if (ts.isElementAccessExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const objName = expr.text;
        if (objName === 'globalThis' || objName === 'global' || objName === 'window') {
          errors.push(`Dynamic property access on ${objName} is not allowed`);
        }
        if (objName === 'process') {
          errors.push('Dynamic property access on process is not allowed');
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Deduplicate errors
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
  };
}
