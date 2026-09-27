import { Request, Response } from 'express';
import { prisma } from '../services/db';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function getHealthCheck(_req: Request, res: Response): Promise<void> {
  let dbStatus = 'ok';
  try {
    // Verify database connectivity by running a lightweight query
    await prisma.$queryRawUnsafe('SELECT 1;');
  } catch (err) {
    logger.error('Health check database query failed:', err);
    dbStatus = 'unhealthy';
  }

  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    service: 'loan-approve-api',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      type: process.env.DATABASE_URL?.startsWith('mysql') ? 'MySQL' : 'SQLite',
    },
  });
}
