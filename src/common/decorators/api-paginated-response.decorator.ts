import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMeta } from '../dto/pagination-meta.dto';

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
