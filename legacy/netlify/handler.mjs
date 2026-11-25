import {createHash, timingSafeEqual} from 'node:crypto';
import makeWorker from '../worker.js';
import {createBlobsStore} from './blobs-store.mjs';

const hash = value => createHash('sha256').update(value).digest();

export function createNetlifyHandler(index, openBlobs, env = process.env) {
  const password = env.ADMIN_PASSWORD;
  const expected = password?.length >= 20 && hash('Basic ' + Buffer.from('organisateur:' + password).toString('base64'));
  const checkAdmin = request => Boolean(expected && timingSafeEqual(hash(request.headers.get('authorization') || ''), expected));
  const worker = makeWorker({'index.html': index}, checkAdmin);

  const STORE = createBlobsStore({
    get: (...args) => openBlobs().get(...args),
    getWithMetadata: (...args) => openBlobs().getWithMetadata(...args),
    setJSON: (...args) => openBlobs().setJSON(...args),
    list: (...args) => openBlobs().list(...args),
  });

  return request => {
    const {pathname} = new URL(request.url);
    const adminPage = ['/admin', '/admin/', '/organisateur', '/organisateur/'].includes(pathname);
    if (adminPage && !expected) {
      return new Response('Espace organisateur indisponible. Configure ADMIN_PASSWORD sur Netlify.', {
        status: 503, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'},
      });
    }
    return worker.fetch(request, {STORE, SITE_ORIGIN: env.EVG_PUBLIC_ORIGIN});
  };
}
