---
sidebar_position: 3
---

# API Conventions

All BreathAway REST APIs follow standard conventions for status codes, payload formatting, error handling, pagination, and date serialization.

---

## 📡 HTTP Methods

We use HTTP methods semantically:

- **`GET`**: Retrieve a resource or list of resources. Safe and idempotent.
- **`POST`**: Create a new resource. Non-idempotent.
- **`PUT`**: Replace an existing resource or update it entirely. Idempotent.
- **`PATCH`**: Partially update a resource.
- **`DELETE`**: Remove a resource.

---

## 📅 Date & Time Format

All dates and timestamps in requests and responses must use **ISO 8601 format in UTC** (Z-timezone):

```json
"createdAt": "2026-07-06T03:52:51.294Z"
```

_In the application bootstrap, the runtime timezone is explicitly locked to UTC using `process.env.TZ = 'UTC'`._

---

## 📋 Standardized Pagination

List endpoints returning collections use a wrapped response envelope containing the data list and a `meta` pagination object matching the `PaginationMeta` DTO.

### Pagination Response Schema

```json
{
  "data": [
    {
      "id": "01J23C4D5E6F7G8H9J0K1L2M3N",
      "firstName": "John",
      "lastName": "Doe"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 🚨 Error Responses (RFC 7807)

When an API request fails, the server responds with a `Content-Type: application/problem+json` header and a standardized JSON structure adhering to the RFC 7807 Problem Details specification.

### 1. General Error Shape

```json
{
  "type": "NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Profile not found",
  "instance": "/api/v1/profiles/me",
  "timestamp": "2026-07-06T03:53:08.000Z",
  "requestId": "f04352d1-df71-4e90-a89b-5816cbfadbde"
}
```

### 2. Validation Error Shape (class-validator)

When body validation fails during request parsing, the filter automatically attaches the failure details in the `invalid_params` array field:

```json
{
  "type": "BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "instance": "/api/v1/profiles",
  "timestamp": "2026-07-06T03:53:08.000Z",
  "requestId": "f04352d1-df71-4e90-a89b-5816cbfadbde",
  "invalid_params": [
    "firstName must be a string",
    "dateOfBirth must be a valid date"
  ]
}
```

### Response Fields

- **`type`**: A UPPER_SNAKE_CASE string identifying the category of error.
- **`title`**: A human-readable summary of the error type.
- **`status`**: The HTTP status code.
- **`detail`**: A specific explanation of what went wrong for this request.
- **`instance`**: The request URI that triggered the error.
- **`timestamp`**: The UTC timestamp when the exception was processed.
- **`requestId`**: The correlation UUID assigned to this request (passed in headers or generated automatically) used to track logs in GCP Cloud Logging.
- **`invalid_params`**: (Optional) An array of specific input fields that failed validation checks.
