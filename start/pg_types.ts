import pg from 'pg'

/**
 * By default node-postgres returns BIGINT (OID 20) columns as JS strings, to avoid silent
 * precision loss for values beyond Number.MAX_SAFE_INTEGER. This codebase represents every
 * monetary amount as a native `bigint` (wallets.balance_cache, ledger_entries.amount/balance_after,
 * wallet limits, ...) and does raw bigint arithmetic on values read straight from the DB
 * (e.g. `wallet.balanceCache - entry.amount.amount`) — mixing a string with a bigint throws
 * `TypeError: Cannot mix BigInt and other types`. Parsing OID 20 as a real BigInt here, once,
 * at boot, makes every one of those reads usable without each call site converting manually.
 */
pg.types.setTypeParser(20, (value: string) => BigInt(value))
