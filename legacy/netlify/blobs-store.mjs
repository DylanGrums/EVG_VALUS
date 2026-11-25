const participationKey = id => 'participations/' + id;

export function createBlobsStore(blobs) {
  const get = key => blobs.get(key, {type: 'json'});
  const set = async (key, data, conditions) => (await blobs.setJSON(key, data, conditions)).modified;

  async function update(key, merge) {
    for (let attempts = 0; attempts < 5; attempts++) {
      const entry = await blobs.getWithMetadata(key, {type: 'json'});
      if (!entry) return false;
      const next = merge(entry.data);
      if (!next) return false;
      if (await set(key, next, {onlyIfMatch: entry.etag})) return true;
    }
    throw new Error('Too many concurrent changes to an EVG record');
  }

  async function readAll(prefix, include = () => true) {
    const {blobs: entries} = await blobs.list({prefix});
    const records = [];
    for (let start = 0; start < entries.length; start += 20) {
      const batch = entries.slice(start, start + 20);
      records.push(...(await Promise.all(batch.map(({key}) => get(key)))).filter(record => record && include(record)));
    }
    return records;
  }

  return {
    versions: async () => (await readAll('versions/')).sort((a, b) => a.version - b.version),
    publish: (version, definition, published_at) =>
      set('versions/' + version, {version, definition, published_at}, {onlyIfNew: true}),
    organizer: () => get('organizer'),
    saveOrganizer: (payload, updated_at) => set('organizer', {payload, updated_at}),
    participants: () => readAll('participations/', row => !row.deleted),
    participant: id => get(participationKey(id)),
    exclude: (id, excluded) => update(participationKey(id), row => !row.deleted && {...row, excluded}),
    remove: id => update(participationKey(id), row => !row.deleted && {deleted: true}),
    createParticipation: (id, record) =>
      set(participationKey(id), {id, revision: 1, excluded: false, ...record}, {onlyIfNew: true}),
    updateParticipation: (id, revision, record) => update(participationKey(id), row =>
      !row.deleted && !row.submitted_at && row.revision === revision && {...row, ...record, revision: revision + 1}),
  };
}
