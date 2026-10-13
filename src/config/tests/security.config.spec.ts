import { NestExpressApplication } from '@nestjs/platform-express';

import {
  API_CSP_DIRECTIVES,
  configureSecurity,
  createSecurityMiddleware,
} from '../security.config';
import { isDocumentationPath } from '../swagger.constants';

interface MockResponse {
  headers: Record<string, string>;
  setHeader: (key: string, value: string) => void;
  removeHeader: (key: string) => void;
  getHeader: (key: string) => string | undefined;
}

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
    },
    removeHeader(key: string) {
      delete headers[key.toLowerCase()];
    },
    getHeader(key: string) {
      return headers[key.toLowerCase()];
    },
  };
}

describe('Security Configuration (SEC-08)', () => {
  describe('isDocumentationPath', () => {
    it('should return true for Swagger public documentation paths', () => {
      expect(isDocumentationPath('/api/public')).toBe(true);
      expect(isDocumentationPath('/api/public/')).toBe(true);
      expect(isDocumentationPath('/api/public/swagger-ui.css')).toBe(true);
      expect(isDocumentationPath('/api/public/redoc')).toBe(true);
      expect(isDocumentationPath('/api/public-json')).toBe(true);
    });

    it('should return true for Swagger admin documentation paths', () => {
      expect(isDocumentationPath('/api/admin')).toBe(true);
      expect(isDocumentationPath('/api/admin/')).toBe(true);
      expect(isDocumentationPath('/api/admin/redoc')).toBe(true);
      expect(isDocumentationPath('/api/admin-json')).toBe(true);
    });

    it('should return true for Docusaurus docs paths', () => {
      expect(isDocumentationPath('/docs')).toBe(true);
      expect(isDocumentationPath('/docs/')).toBe(true);
      expect(isDocumentationPath('/docs/intro')).toBe(true);
      expect(isDocumentationPath('/docs/assets/js/main.js')).toBe(true);
    });

    it('should handle URLs with query parameters and hash anchors correctly', () => {
      expect(isDocumentationPath('/api/public?docExpansion=list')).toBe(true);
      expect(isDocumentationPath('/docs/intro#overview')).toBe(true);
      expect(isDocumentationPath('/api/public/redoc?spec=true#section')).toBe(
        true,
      );
    });

    it('should return false for regular REST API endpoints', () => {
      expect(isDocumentationPath('/api/v1/auth/login')).toBe(false);
      expect(isDocumentationPath('/api/v1/profiles')).toBe(false);
      expect(isDocumentationPath('/health')).toBe(false);
      expect(isDocumentationPath('/webhooks/meta')).toBe(false);
      expect(isDocumentationPath('/api/v1/payments/webhook')).toBe(false);
    });

    it('should return false for paths that only share a prefix substring', () => {
      expect(isDocumentationPath('/api/publicity')).toBe(false);
      expect(isDocumentationPath('/api/administrator')).toBe(false);
      expect(isDocumentationPath('/docs-unrelated')).toBe(false);
    });

    it('should return false for empty or undefined input', () => {
      expect(isDocumentationPath('')).toBe(false);
      expect(isDocumentationPath(null)).toBe(false);
      expect(isDocumentationPath(undefined)).toBe(false);
    });
  });

  describe('createSecurityMiddleware', () => {
    const middleware = createSecurityMiddleware();

    it('should set strict Content-Security-Policy on REST API requests', (done) => {
      const req = {
        url: '/api/v1/auth/login',
        method: 'GET',
        headers: {},
      };
      const res = createMockResponse();

      middleware(req as never, res as never, (err?: unknown) => {
        expect(err).toBeUndefined();

        const csp = res.getHeader('content-security-policy');
        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("base-uri 'none'");
        expect(csp).toContain("form-action 'none'");

        expect(res.getHeader('x-content-type-options')).toBe('nosniff');
        expect(res.getHeader('cross-origin-resource-policy')).toBe(
          'cross-origin',
        );
        done();
      });
    });

    it('should NOT set Content-Security-Policy on Swagger public documentation routes', (done) => {
      const req = {
        url: '/api/public',
        method: 'GET',
        headers: {},
      };
      const res = createMockResponse();

      middleware(req as never, res as never, (err?: unknown) => {
        expect(err).toBeUndefined();

        expect(res.getHeader('content-security-policy')).toBeUndefined();
        expect(res.getHeader('x-content-type-options')).toBe('nosniff');
        expect(res.getHeader('cross-origin-resource-policy')).toBe(
          'cross-origin',
        );
        done();
      });
    });

    it('should NOT set Content-Security-Policy on Swagger admin documentation routes', (done) => {
      const req = {
        url: '/api/admin/redoc',
        method: 'GET',
        headers: {},
      };
      const res = createMockResponse();

      middleware(req as never, res as never, (err?: unknown) => {
        expect(err).toBeUndefined();
        expect(res.getHeader('content-security-policy')).toBeUndefined();
        done();
      });
    });

    it('should NOT set Content-Security-Policy on Docusaurus docs routes', (done) => {
      const req = {
        url: '/docs/intro?search=test',
        method: 'GET',
        headers: {},
      };
      const res = createMockResponse();

      middleware(req as never, res as never, (err?: unknown) => {
        expect(err).toBeUndefined();
        expect(res.getHeader('content-security-policy')).toBeUndefined();
        done();
      });
    });

    it('should respect req.originalUrl over req.url when available', (done) => {
      const req = {
        originalUrl: '/api/public/swagger-ui-bundle.js',
        url: '/swagger-ui-bundle.js',
        method: 'GET',
        headers: {},
      };
      const res = createMockResponse();

      middleware(req as never, res as never, (err?: unknown) => {
        expect(err).toBeUndefined();
        expect(res.getHeader('content-security-policy')).toBeUndefined();
        done();
      });
    });
  });

  describe('configureSecurity', () => {
    it('should configure trust proxy to 1 and register the security middleware', () => {
      const appMock = {
        set: jest.fn(),
        use: jest.fn(),
      };

      configureSecurity(appMock as unknown as NestExpressApplication);

      expect(appMock.set).toHaveBeenCalledWith('trust proxy', 1);
      expect(appMock.use).toHaveBeenCalledTimes(1);
      expect(appMock.use).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('API_CSP_DIRECTIVES', () => {
    it('should define strict directives forbidding content execution', () => {
      expect(API_CSP_DIRECTIVES.defaultSrc).toEqual(["'none'"]);
      expect(API_CSP_DIRECTIVES.frameAncestors).toEqual(["'none'"]);
      expect(API_CSP_DIRECTIVES.baseUri).toEqual(["'none'"]);
      expect(API_CSP_DIRECTIVES.formAction).toEqual(["'none'"]);
      expect(API_CSP_DIRECTIVES.scriptSrc).toBeNull();
      expect(API_CSP_DIRECTIVES.styleSrc).toBeNull();
      expect(API_CSP_DIRECTIVES.imgSrc).toBeNull();
    });
  });
});
