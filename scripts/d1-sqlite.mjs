// A D1-shaped adapter over Node's built-in SQLite, for local development and tests.
// D1 is SQLite, so the Worker's real SQL (including its compare-and-set UPDATE) runs unchanged.
import {DatabaseSync} from 'node:sqlite';

export function sqliteD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args)}),
    run: async () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {
    prepare: sql => statement(sql),
    // Like D1.batch: all statements in one transaction.
    batch: async list => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    // Dev helper, not part of D1.
    reset: () => { for (const table of ['trip_plan', 'trip_history']) { try { db.exec(`DELETE FROM ${table}`); } catch { /* not created yet */ } } },
  };
}
