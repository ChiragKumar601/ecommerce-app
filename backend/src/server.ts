import { createApp } from './api/app.js';
import { createContext } from './api/bootstrap.js';

const ctx = await createContext();
ctx.settings.watch();
const app = createApp(ctx);

app.listen(ctx.env.PORT, () => {
  ctx.logger.log('info', `API listening on http://localhost:${ctx.env.PORT}/api/v1`);
});
