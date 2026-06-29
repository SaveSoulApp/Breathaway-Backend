# Supabase Auth Guidelines
- Always extract the JWT from the `Authorization` header.
- Verify the JWT signature using Supabase JWT secret.
- Ensure user roles are properly decoded from the payload.
- Do not trust user-provided user IDs in the request body if they can be inferred from the token.
