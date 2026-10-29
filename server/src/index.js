import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './services/store.js';
await connectDatabase();
app.listen(env.PORT,()=>console.info(`AI Court API listening on http://localhost:${env.PORT}`));
