import { createApp } from './api/app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[backend] API listening on http://localhost:${env.PORT}/api/v1`);
});
