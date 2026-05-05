import { ClassConstructor, plainToInstance } from 'class-transformer';

/**
 * Transforms a plain object or array of objects to class instance(s) with excludeExtraneousValues set to true
 * @param cls The class to transform to
 * @param plain The plain object(s) to transform
 * @returns The transformed class instance(s)
 */
export function transformToDto<T, V>(cls: ClassConstructor<T>, plain: V): T {
  return plainToInstance(cls, plain, {
    excludeExtraneousValues: true,
  });
}