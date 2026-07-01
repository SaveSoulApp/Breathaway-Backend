# RESTful URL & Structure
- Enforce strict RESTful URL structures (e.g., `/users/:id/posts`).
- Require API versioning on all routes (URI-based: `/v1/`, or NestJS `@Version()`).
- Flag any route deeper than 3 nesting levels (e.g., `/users/:id/posts/:postId/comments` is acceptable; adding another level is not).

# HTTP Status Codes
Use these codes consistently. Flag any deviation:
- 200: Successful GET, PATCH
- 201: Successful POST (resource created)
- 204: Successful DELETE (no body returned)
- 400: Validation failure (`class-validator` errors)
- 401: Missing or invalid auth token
- 403: Authenticated but not authorized
- 404: Resource not found
- 409: Unique constraint violation (Prisma `P2002`)
- 422: Business logic rejection (valid shape, invalid state)
- 500: Unhandled server error — always document as fallback
