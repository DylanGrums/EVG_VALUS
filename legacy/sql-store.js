export function createSqlStore(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results;
  const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
  const changed = async (sql, ...values) => (await db.prepare(sql).bind(...values).run()).meta.changes === 1;

  return {
    versions: () => all('SELECT version, definition, published_at FROM questionnaire_versions ORDER BY version'),
    publish: (version, definition, timestamp) => changed(
      'INSERT INTO questionnaire_versions VALUES (?, ?, ?) ON CONFLICT(version) DO NOTHING',
      version, definition, timestamp),
    organizer: () => first('SELECT payload, updated_at FROM organizer WHERE id = 1'),
    saveOrganizer: (payload, timestamp) => changed(
      'INSERT INTO organizer VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      payload, timestamp),
    participants: () => all('SELECT id, payload, updated_at, submitted_at, excluded FROM participations WHERE deleted = 0'),
    participant: id => first('SELECT payload, revision, submitted_at, deleted FROM participations WHERE id = ?', id),
    exclude: (id, excluded) => changed('UPDATE participations SET excluded = ? WHERE id = ? AND deleted = 0', Number(excluded), id),
    remove: id => changed(
      "UPDATE participations SET payload = NULL, updated_at = '', submitted_at = NULL, excluded = 0, revision = 0, deleted = 1 WHERE id = ? AND deleted = 0", id),
    createParticipation: (id, {payload, updated_at, submitted_at}) => changed(
      'INSERT INTO participations (id, payload, revision, updated_at, submitted_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING',
      id, payload, updated_at, submitted_at),
    updateParticipation: (id, revision, {payload, updated_at, submitted_at}) => changed(
      'UPDATE participations SET payload = ?, revision = revision + 1, updated_at = ?, submitted_at = ? WHERE id = ? AND revision = ? AND submitted_at IS NULL AND deleted = 0',
      payload, updated_at, submitted_at, id, revision),
  };
}
