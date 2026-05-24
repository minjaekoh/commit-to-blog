import 'dotenv/config';
import express from 'express';

import { connectDatabase } from './config/db';
import { commitsRouter } from './routes/commits';
import { diffRouter } from './routes/diff';
import { healthRouter } from './routes/health';
import { interviewRouter } from './routes/interview';
import { postsRouter } from './routes/posts';
import { reposRouter } from './routes/repos';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/repos', reposRouter);
app.use('/api/commits', commitsRouter);
app.use('/api/diff', diffRouter);
app.use('/api/interview', interviewRouter);
app.use('/api/posts', postsRouter);

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

async function bootstrap() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required.');
  }

  await connectDatabase(mongoUri);

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`server listening on http://localhost:${port}`);
  });
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('failed to start server', error);
  process.exit(1);
});
