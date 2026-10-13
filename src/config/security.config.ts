import { NestExpressApplication } from '@nestjs/platform-express';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

import { isDocumentationPath } from './swagger.constants';

/**
 * Strict Content Security Policy (CSP) directives enforced on standard REST API endpoints (SEC-08).
 *
 * REST API responses serve raw JSON and must never be framed or execute scripts, styles,
 * or plugins in browser contexts.
 *
 * - `default-src 'none'`: Blocks all loading of external assets (scripts, styles, images, fonts).
 * - `frame-ancestors 'none'`: Prevents clickjacking and unauthorized embedding in frames/iframes.
 * - `base-uri 'none'`: Disallows document base URI manipulation.
 * - `form-action 'none'`: Disallows form submissions.
 */
export const API_CSP_DIRECTIVES = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  scriptSrc: null,
  scriptSrcAttr: null,
  styleSrc: null,
  imgSrc: null,
  fontSrc: null,
  objectSrc: null,
  upgradeInsecureRequests: null,
};

/**
 * Creates route-scoped security middleware using Helmet.
 *
 * Enforces standard security headers globally (nosniff, HSTS, cross-origin resource policies, etc.),
 * while scoping the strict Content Security Policy (CSP) to API endpoints only.
 * Documentation subpaths (Swagger UI, ReDoc, Docusaurus) are exempted from the strict CSP
 * to allow their required UI bundles, fonts, and inline assets to render correctly.
 *
 * @returns An Express RequestHandler composing base Helmet headers and route-scoped CSP.
 */
export function createSecurityMiddleware(): RequestHandler {
  const baseHelmet = helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  const apiCsp = helmet.contentSecurityPolicy({
    directives: API_CSP_DIRECTIVES,
  });

  return (req, res, next) => {
    baseHelmet(req, res, (err?: unknown) => {
      if (err) {
        return next(err);
      }

      const targetUrl = req.originalUrl || req.url || '';
      if (isDocumentationPath(targetUrl)) {
        return next();
      }

      return apiCsp(req, res, next);
    });
  };
}

/**
 * Configures HTTP security headers and reverse proxy trust on the NestJS Express application.
 *
 * 1. Sets reverse proxy trust to 1 hop for GCP Cloud Run edge resolution (SEC-07).
 * 2. Applies route-scoped Helmet middleware with strict CSP for APIs and relaxed rules for docs (SEC-08).
 *
 * @param app - The NestExpressApplication instance.
 */
export function configureSecurity(app: NestExpressApplication): void {
  // Trust immediate reverse proxy hop (GCP Cloud Run edge) to safely derive req.ip without spoofing (SEC-07)
  app.set('trust proxy', 1);

  app.use(createSecurityMiddleware());
}
