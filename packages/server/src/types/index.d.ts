import 'express';

declare module 'express' {
  interface Request {
    user?: {
      id: string;
      [key: string]: any;
    };
    session?: {
      csrfToken?: string;
      [key: string]: any;
    };
    startTime?: number;
  }
}

export interface SecurityConfig {
  csrfProtection?: boolean;
  rateLimit?: number;
  disableCSP?: boolean;
  cspReportUri?: string;
}

export interface SyncConfig {
  mongodb: any;
  authValidator?: (req: any) => boolean | Promise<boolean>;
  getUserId?: (req: any) => string;
  userIdField?: string;
  collections?: Record<string, any>;
  security?: SecurityConfig;
  logging?: {
    level?: string;
  };
}

export interface RateLimiterError {
  msBeforeNext?: number;
}