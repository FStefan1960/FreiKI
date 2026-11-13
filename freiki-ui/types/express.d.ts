import type { Session } from '../src/core/auth/AuthMiddleware';
declare global {
  namespace Express {
    interface Request { admin?: Session; user?: Session; }
  }
}
export {};
