import { createApp } from './api/app.js';
import { createContext } from './api/bootstrap.js';
import { getDynamic, getSnapshot } from './services/catalogue/snapshot.js';
import { indexFor } from './services/search/index.js';

const ctx = await createContext();
ctx.settings.watch();
const app = createApp(ctx);

// Build the catalogue read model before serving, and again whenever the catalogue changes (PR-22).
const warm = () =>
  Promise.all([getSnapshot(ctx).then(indexFor), getDynamic(ctx)]).catch((err: unknown) => ctx.logger.log('error', 'catalogue warm-up failed', { err: String(err) }));
await warm();
ctx.settings.on('catalogueChanged', () => void warm());

app.listen(ctx.env.PORT, () => {
  ctx.logger.log('info', `API listening on http://localhost:${ctx.env.PORT}/api/v1`);
});
