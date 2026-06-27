import { ClassConstructor, plainToInstance } from 'class-transformer';

/**
 * Instantiates a DTO class from a plain object and strips out any unmapped properties.
 *
 * Enforces strict payload shaping by utilizing `excludeExtraneousValues: true`. This prevents
 * malicious or unexpected data from leaking through the transformation boundary, ensuring that
 * only properties explicitly decorated with `@Expose()` in the DTO class are retained.
 *
 * @param cls - The target DTO class constructor to instantiate.
 * @param plain - The raw input data (e.g., from a database or external API) to transform.
 * @returns A new instance of the DTO class containing only the explicitly exposed properties.
 */
export function transformToDto<T, V>(cls: ClassConstructor<T>, plain: V): T {
  return plainToInstance(cls, plain, {
    excludeExtraneousValues: true,
  });
}
