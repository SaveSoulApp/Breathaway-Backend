# Standard Error Response Shape
All error responses must conform to this shape (enforced via a global exception filter):
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User with id 42 not found",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/v1/users/42"
}
```
Flag any controller that relies on NestJS's default exception format without this shape applied.

# Prisma Error Mapping
Require a global `PrismaExceptionFilter` that maps Prisma error codes to HTTP responses:
- P2002 -> 409 Conflict (Unique constraint violation)
- P2025 -> 404 Not Found (Record not found)
- P2003 -> 400 Bad Request (Foreign key constraint)
- P2000 -> 400 Bad Request (Value too long for field)
