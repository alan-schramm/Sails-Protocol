import { z } from 'zod'

/**
 * PRODUCTION_READINESS_FIXES.md item 21 ("Adicionar OpenAPI schemas nas
 * rotas"), closed 2026-08-08 — every route already validates its own
 * body/params/querystring with a Zod schema via `.parse()` inside the
 * handler; that Zod object is now also the single source of truth for
 * the route's real OpenAPI documentation (`@fastify/swagger` reads
 * `schema.body`/`.params`/`.querystring` to build the spec).
 *
 * Uses Zod v4's own native `z.toJSONSchema()`, not the third-party
 * `zod-to-json-schema` package — tried that first, but its 3.25.2
 * release (despite listing zod "^3.25.28 || ^4" as a valid peer)
 * produces an EMPTY schema (`{ $schema: ... }`, no properties at all)
 * against a real Zod v4 object; it doesn't actually introspect v4's
 * internal `_zod.def` shape correctly yet. Confirmed by running both
 * side by side before picking one, not assumed from either package's
 * own claims. `target: 'draft-7'` matches the draft Fastify's bundled
 * ajv (v8's default export) actually validates against.
 *
 * `docsOnlySchema()` below is deliberately NOT wired to actually
 * validate anything at runtime — two real landmines found while
 * scoping this item, both before writing any route-facing code:
 *
 * 1. A plain `schema: { body: jsonSchema(...) }` makes Fastify's own
 *    ajv validate the request *before* the handler runs and auto-reject
 *    an invalid one with Fastify's generic error shape — a silent break
 *    of the `VALIDATION_ERROR` contract `packages/sails-sdk/src/errors.ts`
 *    already documents and every existing SDK consumer relies on.
 * 2. `attachValidation: true` stops the auto-reject, but ajv still RUNS
 *    and, with Fastify's default `coerceTypes`, mutates `request.body`/
 *    `.query`/`.params` in place before the handler sees it — e.g. a
 *    `voucheeId: 123` (wrong type) got silently coerced to `"123"` and
 *    then passed the handler's own `.parse()`, silently accepting input
 *    the exact same schema used to reject. Confirmed with a real
 *    `app.inject()` round-trip, not assumed.
 *
 * `validatorCompiler: () => () => true` sidesteps both: Fastify never
 * builds or runs an ajv validator for this route at all (schema stays
 * pure metadata for `@fastify/swagger` to read), so `request.body`/
 * `.query`/`.params` reach the handler byte-for-byte unmodified — the
 * handler's own `.parse()` remains the ONLY thing that can ever
 * validate or reject, exactly as before this file existed.
 *
 * NOT applied globally in app.ts — `src/core/intent.routes.ts` already
 * has two routes with real, pre-existing, hand-written `schema.body`/
 * `.params` that DO rely on Fastify's actual ajv enforcement (no
 * no-op compiler, no attachValidation) — a global override would have
 * silently defanged that already-shipped behavior. Left untouched;
 * out of scope for this pass.
 */
// `unrepresentable: 'any'` — z.toJSONSchema() otherwise *throws* at route
// registration time (crashing server startup, not a per-request error)
// on any field JSON Schema has no native representation for, e.g.
// `z.coerce.date()` (trade.routes.ts's reconcile route) — "Date cannot
// be represented in JSON Schema". Found the hard way: it doesn't fail
// until buildApp() actually registers that specific route. `'any'` falls
// back to `{}` (accepts anything) for exactly those fields instead of
// throwing — harmless here since this schema is never used for real
// enforcement (see this file's header comment), only for documentation.
function jsonSchema(schema: z.ZodType): object {
  return z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' })
}

export function docsOnlySchema(shape: {
  tags?: string[]
  body?: z.ZodType
  params?: z.ZodType
  querystring?: z.ZodType
}): { schema: Record<string, unknown>; validatorCompiler: () => () => boolean } {
  const schema: Record<string, unknown> = {}
  if (shape.tags) schema.tags = shape.tags
  if (shape.body) schema.body = jsonSchema(shape.body)
  if (shape.params) schema.params = jsonSchema(shape.params)
  if (shape.querystring) schema.querystring = jsonSchema(shape.querystring)
  return { schema, validatorCompiler: () => () => true }
}
