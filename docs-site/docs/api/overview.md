---
sidebar_position: 1
---

# API Overview

This section covers the communication protocols, base paths, and documentation endpoints for the BreathAway REST APIs.

---

## 🚦 Versioning

The API uses **URI Versioning** to ensure backward compatibility. Every endpoint path is prefixed with the version identifier:

```
https://<host>/api/v1/
```

For example:
- Get User Profile: `/api/v1/profiles/me`
- Create Like: `/api/v1/likes`

*The default version is set to `1`. Version prefixes are configured globally during bootstrap in `src/main.ts` using `app.enableVersioning()`.*

---

## 📖 Swagger / OpenAPI Documentation

BreathAway has split OpenAPI configurations to keep documentation lean and tailored to different clients:

### 1. Public API Docs (Mobile & Frontend)
- **Scope**: Contains modules that serve the customer-facing mobile application (e.g. Auth, Profiles, Preferences, Likes, Matches, Chats, Credits).
- **Swagger UI Path**: `/api/public`
- **ReDoc UI Path**: `/api/public/redoc`
- **JSON Specification**: `/api/public-json`

### 2. Admin API Docs (Internal Dashboards)
- **Scope**: Contains modules for administration and third-party webhooks (e.g. Admin, Maintenance, IdentityWorkflows, PubSub, Instagram, Webhooks).
- **Swagger UI Path**: `/api/admin`
- **ReDoc UI Path**: `/api/admin/redoc`
- **JSON Specification**: `/api/admin-json`

---

## 🔒 Accessing Swagger in Local Development

To view the Swagger documents locally:
1. Ensure the application is started: `pnpm run start:dev`
2. Make sure Swagger is enabled in your `.env` file:
   ```env
   SWAGGER_ENABLED=true
   ```
3. Open your browser and visit:
   - Public UI: [http://localhost:3000/api/public](http://localhost:3000/api/public)
   - Admin UI: [http://localhost:3000/api/admin](http://localhost:3000/api/admin)

> [!NOTE]
> Swagger endpoints may be protected with basic authentication in staging/production environments to prevent leaking API specifications. Use the configured Swagger username and password retrieved from environment variables (or GCP Secret Manager) to authenticate.
