/**
 * scripts/check-core-boundary.ts — Sails Core Implementation Program,
 * Phase 1 (M0 — Mechanical Pure-Core Boundary).
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §17 requires a *mechanical*
 * enforcement of Pure Core's dependency/effect boundary, explicitly
 * rejecting reliance on npm workspace dependency omission — direct
 * inspection during that document's own validation confirmed this
 * repository's npm hoisting resolves most dependencies from the root
 * `node_modules` regardless of which workspace package's own
 * `package.json` declares them, so a package boundary alone proves
 * nothing. This script is the static, declaration-level check that
 * closes that gap: it parses Pure Core's own source (never trusts what
 * would or wouldn't resolve at runtime) and rejects two independent
 * classes of violation:
 *
 *  1. any import (static, `require(...)`, or dynamic `import(...)`) that
 *     is not a relative path within the package — Pure Core is
 *     architecturally required to depend on nothing external
 *     (`CORE_IMPLEMENTATION_ARCHITECTURE.md` §5-7, §19: language-neutral
 *     semantic types need no runtime dependency at all);
 *  2. any reference to an ambient-effect global (`process`, `fetch`,
 *     `Date.now()`/bare `new Date()`, timers, `Math.random`, Node's
 *     `__dirname`/`__filename`) — the specific list in
 *     `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §17 and the parent
 *     mission's §6/§8.
 *
 * `checkSourceText` is exported so `tests/coreBoundaryCheck.test.ts` can
 * exercise both violating and clean fixtures directly, in memory,
 * without ever letting an intentionally-invalid file enter a real
 * compilation path (see that test file's own header for why the
 * fixtures are not `.ts` files).
 */
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

export type BoundaryRule =
  | 'forbidden-import'
  | 'forbidden-require'
  | 'forbidden-dynamic-import'
  | 'ambient-global'

export interface BoundaryViolation {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly rule: BoundaryRule
  readonly detail: string
}

const isRelativeSpecifier = (specifier: string): boolean =>
  specifier.startsWith('.') || specifier.startsWith('/')

// Bare identifiers whose mere presence is an ambient-effect violation,
// regardless of how they're used (reading `process` at all already
// implies environment/process ambient authority Pure Core must never
// have — this is deliberately broader than just `process.env`).
const BANNED_BARE_IDENTIFIERS = new Set([
  'process',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'setTimeout',
  'setInterval',
  'setImmediate',
  '__dirname',
  '__filename',
])

// Property-access chains (`Foo.bar`) that are ambient-effect violations
// specifically in that combination — `Math` and `Date` themselves are
// not banned (pure, deterministic uses like `Date.UTC(...)` or comparing
// two already-supplied `Date` values are legitimate pure computation;
// only the implicit-clock/implicit-randomness surface is banned).
const BANNED_PROPERTY_CHAINS: ReadonlyArray<readonly [string, string]> = [
  ['Math', 'random'],
  ['Date', 'now'],
]

function reportAmbientAt(
  violations: BoundaryViolation[],
  sourceFile: ts.SourceFile,
  fileName: string,
  node: ts.Node,
  detail: string,
): void {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  violations.push({
    file: fileName,
    line: line + 1,
    column: character + 1,
    rule: 'ambient-global',
    detail,
  })
}

function reportImportAt(
  violations: BoundaryViolation[],
  sourceFile: ts.SourceFile,
  fileName: string,
  node: ts.Node,
  rule: Exclude<BoundaryRule, 'ambient-global'>,
  specifier: string,
): void {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  violations.push({
    file: fileName,
    line: line + 1,
    column: character + 1,
    rule,
    detail: `non-relative module specifier "${specifier}" — Pure Core may depend on nothing external`,
  })
}

/**
 * Parses one file's source text and returns every boundary violation
 * found. `fileName` is used only for diagnostics (line/column context
 * and the reported `file` field) — it need not exist on disk, which is
 * what lets fixture-based tests call this directly with a synthetic name.
 */
export function checkSourceText(fileName: string, sourceText: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )

  const visit = (node: ts.Node): void => {
    // import ... from 'x'; export ... from 'x';
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text
      if (!isRelativeSpecifier(specifier)) {
        reportImportAt(violations, sourceFile, fileName, node.moduleSpecifier, 'forbidden-import', specifier)
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression

      // require('x') — a static-analysis backdoor around ES import
      // syntax; banned outright regardless of specifier, since Pure
      // Core's source is authored exclusively with `import`.
      if (ts.isIdentifier(callee) && callee.text === 'require') {
        const arg = node.arguments[0]
        const specifier = arg && ts.isStringLiteral(arg) ? arg.text : '<dynamic>'
        reportImportAt(violations, sourceFile, fileName, node, 'forbidden-require', specifier)
      }

      // dynamic import('x')
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0]
        const specifier = arg && ts.isStringLiteral(arg) ? arg.text : '<dynamic>'
        if (specifier === '<dynamic>' || !isRelativeSpecifier(specifier)) {
          reportImportAt(violations, sourceFile, fileName, node, 'forbidden-dynamic-import', specifier)
        }
      }

      // Math.random() / Date.now()
      if (ts.isPropertyAccessExpression(callee)) {
        for (const [objectName, propertyName] of BANNED_PROPERTY_CHAINS) {
          if (
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === objectName &&
            callee.name.text === propertyName
          ) {
            reportAmbientAt(violations, sourceFile, fileName, node, `${objectName}.${propertyName}() is an implicit ambient input`)
          }
        }
      }
    }

    // new Date() with zero arguments — the implicit-clock form.
    // new Date(explicitTimestamp) is legitimate pure conversion of an
    // already-supplied value and is never flagged.
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
      const argCount = node.arguments ? node.arguments.length : 0
      if (argCount === 0) {
        reportAmbientAt(violations, sourceFile, fileName, node, 'new Date() with no arguments reads the implicit wall clock')
      }
    }

    // Bare identifier references: process, fetch, timers, __dirname, ...
    // Skip identifiers that are themselves the property name in a
    // member access (`x.process` is not the global `process`) and skip
    // declaration positions (naming a local `process` variable is not a
    // reference to the ambient global, though shadowing it like this is
    // discouraged for its own confusing-code reasons, not a boundary
    // violation).
    if (
      ts.isIdentifier(node) &&
      BANNED_BARE_IDENTIFIERS.has(node.text) &&
      !ts.isPropertyAccessExpression(node.parent) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !isDeclarationName(node)
    ) {
      reportAmbientAt(violations, sourceFile, fileName, node, `reference to ambient global "${node.text}"`)
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      BANNED_BARE_IDENTIFIERS.has(node.expression.text)
    ) {
      reportAmbientAt(violations, sourceFile, fileName, node, `reference to ambient global "${node.expression.text}"`)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent
  return (
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isImportSpecifier(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node)
  )
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      out.push(full)
    }
  }
}

/** Checks every real `.ts` file under `srcDir`, returning all violations. */
export function checkDirectory(srcDir: string): BoundaryViolation[] {
  const files: string[] = []
  walk(srcDir, files)
  const violations: BoundaryViolation[] = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    violations.push(...checkSourceText(file, text))
  }
  return violations
}

function main(): void {
  const target = process.argv[2] ?? path.join('packages', 'sails-core', 'src')
  const resolved = path.resolve(process.cwd(), target)
  if (!fs.existsSync(resolved)) {
    console.error(`check-core-boundary: target directory does not exist: ${resolved}`)
    process.exit(2)
  }
  const violations = checkDirectory(resolved)
  if (violations.length === 0) {
    console.log(`check-core-boundary: clean — no forbidden imports or ambient-effect references under ${target}`)
    process.exit(0)
  }
  console.error(`check-core-boundary: ${violations.length} violation(s) found under ${target}:`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.column} [${v.rule}] ${v.detail}`)
  }
  process.exit(1)
}

if (require.main === module) {
  main()
}
