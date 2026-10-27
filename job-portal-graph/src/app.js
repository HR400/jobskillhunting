import express from 'express';
import pinoHttp from 'pino-http';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import { globalLimiter, authLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { candidatesRouter } from './routes/candidates.js';
import { skillsRouter } from './routes/skills.js';
import { jobsRouter } from './routes/jobs.js';
import { matchRouter } from './routes/match.js';
import { gapRouter } from './routes/gap.js';
import { referralsRouter } from './routes/referrals.js';
import { recruiterRouter } from './routes/recruiter.js';
import { applicationsRouter } from './routes/applications.js';
import { ingestRouter } from './routes/ingest.js';
import { semanticRouter } from './routes/semantic.js';
import { analyticsRouter } from './routes/analytics.js';
import { careerPathRouter } from './routes/careerPath.js';
import { metaRouter } from './routes/meta.js';
import { reportRouter } from './routes/report.js';
import './ingest/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // ── Security ───────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS: same-origin only in production; allow localhost in development.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed =
      config.NODE_ENV === 'development'
        ? /^https?:\/\/localhost(:\d+)?$/
        : null;
    if (allowed && origin && allowed.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,X-Request-Id',
      );
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Observability ──────────────────────────────────────────────────────────
  app.use(requestId);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
    }),
  );

  // ── Health probes (before rate limiting so monitors are never throttled) ──
  app.use(healthRouter);

  // ── Performance ────────────────────────────────────────────────────────────
  app.use(compression());

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'test') {
    app.use(globalLimiter);
    app.use('/api/auth', authLimiter);
  }

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Vendor libraries (vis-network, d3)
  app.use(
    '/vendor/vis-network',
    express.static(fileURLToPath(new URL('../node_modules/vis-network', import.meta.url))),
  );
  app.use(
    '/vendor/d3',
    express.static(fileURLToPath(new URL('../node_modules/d3/dist', import.meta.url))),
  );

  // Static frontend (public/index.html at /). Served before /api routes —
  // the two never overlap.
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/candidates', candidatesRouter);
  app.use('/api/skills', skillsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/match', matchRouter);
  app.use('/api/gap', gapRouter);
  app.use('/api/referrals', referralsRouter);
  app.use('/api/recruiter', recruiterRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/career-path', careerPathRouter);
  app.use('/api/search', semanticRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/report', reportRouter);

  // Catch-all 404 for /api/* before the generic error handler.
  app.use('/api/*splat', notFoundHandler);

  // Central error handler — must be last.
  app.use(errorHandler);

  return app;
}
