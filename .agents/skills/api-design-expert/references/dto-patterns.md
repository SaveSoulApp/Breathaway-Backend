# DTO Rules

- **Never expose raw Prisma models** from a controller. Always map through a ResponseDTO.
- Use the following DTO pattern per resource:
  - `CreateXxxDto`: POST body — all required fields
  - `UpdateXxxDto`: PATCH body — extend with `PartialType(...)`
  - `XxxResponseDto`: Shape returned to the client
  - `XxxQueryDto`: GET query params — pagination + filters

- Every DTO property must have `@ApiProperty({ example, description })`.
- Use `@ApiPropertyOptional(...)` for optional fields instead of `@ApiProperty({ required: false })`.
- For `UpdateXxxDto`, always use:
  ```typescript
  export class UpdateXxxDto extends PartialType(CreateXxxDto) {}
  ```
