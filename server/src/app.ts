import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { globalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes';

export function createApp(): Express {
  const app = express();

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible integration in dev/testing
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS configuration (Strict client origin allowed with seamless localhost & Vercel deployment support)
  const allowedOrigins = [config.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or server-to-server)
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/$/, '');
        const isAllowed =
          allowedOrigins.some((allowed) => allowed && allowed.replace(/\/$/, '') === cleanOrigin) ||
          (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ||
          origin.endsWith('.vercel.app');
        if (isAllowed) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Request Rate Limiting
  app.use('/api', globalLimiter);

  // Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logging
  if (config.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Serve branding assets (logos, favicons) as public static files if directory exists locally
  const brandingDir = path.join(process.cwd(), 'uploads', 'branding');
  try {
    if (fs.existsSync(brandingDir)) {
      app.use('/uploads/branding', express.static(brandingDir, { maxAge: '1d' }));
    }
  } catch {
    // Ignore static serving setup errors in read-only serverless environments
  }

  // Root health check endpoint for deployment monitoring
  app.get('/', (req, res) => {
    res.json({ success: true, message: 'Loan Approve API Service' });
  });

  // API Routes (Mounted at /api and / for maximum serverless router compatibility)
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  // 404 Route Handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
