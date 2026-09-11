/**
 * Minimal ambient typing for the `pg` package — this project has no `@types/pg` dependency,
 * and only needs the type-parser registration API (see start/pg_types.ts).
 */
declare module 'pg' {
  export const types: {
    setTypeParser(oid: number, parser: (value: string) => unknown): void
  }
  const pg: {
    types: typeof types
  }
  export default pg
}
