import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMeta } from '../dto/pagination-meta.dto';

/**
 * Attaches OpenAPI (Swagger) documentation for a paginated API response.
 *
 * Wraps the provided DTO inside a standard pagination envelope containing
 * both the data array and pagination metadata (e.g., total count, current page).
 *
 * @param dataDto - The DTO class representing a single item in the paginated results.
 * @param description - Optional narrative description for the Swagger UI; defaults to 'Paginated list of results'.
 * @returns A composite NestJS decorator combining model registration and the structured HTTP 200 response schema.
 */
export const ApiPaginatedResponse = <DataDto extends Type<unknown>>(
  dataDto: DataDto,
  description: string = 'Paginated list of results',
) => {
  return applyDecorators(
    ApiExtraModels(PaginationMeta, dataDto),
    ApiOkResponse({
      description,
      schema: {
        allOf: [
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(dataDto) },
              },
              meta: {
                $ref: getSchemaPath(PaginationMeta),
              },
            },
          },
        ],
      },
    }),
  );
};
