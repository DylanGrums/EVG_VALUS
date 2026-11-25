import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

export function openDatabase(dbPath) {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(readFileSync(new URL('drizzle/0000_carnet.sql', import.meta.url), 'utf8'));
  if (sqlite.prepare('PRAGMA user_version').get().user_version < 1) {
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('drizzle/0001_participations.sql', import.meta.url), 'utf8'));
      sqlite.exec('PRAGMA user_version = 1');
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const executor = values => ({
        all: () => ({results: statement.all(...values)}),
        first: () => statement.get(...values),
        run: () => ({meta: statement.run(...values)}),
      });
      return {...executor([]), bind: (...values) => executor(values)};
    },
  };
}
