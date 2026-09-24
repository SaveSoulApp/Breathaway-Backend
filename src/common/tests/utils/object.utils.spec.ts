import { merge3Instances, mergeInstances } from '@common/utils/object.utils';

describe('ObjectUtils', () => {
  describe('mergeInstances', () => {
    it('should shallow merge two objects with later object overriding earlier properties', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 20, c: 3 };

      const result = mergeInstances(obj1, obj2);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });
  });

  describe('merge3Instances', () => {
    it('should shallow merge three objects with cascade overriding', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { b: 20, c: 30 };
      const obj3 = { c: 300, d: 4 };

      const result = merge3Instances(obj1, obj2, obj3);

      expect(result).toEqual({ a: 1, b: 20, c: 300, d: 4 });
    });
  });
});
