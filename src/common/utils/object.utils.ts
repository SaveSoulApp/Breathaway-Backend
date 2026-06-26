/**
 * Merges two object instances into a single combined type.
 *
 * Performs a shallow merge, with properties from the second object overwriting those in the first.
 *
 * @param obj1 - The base object.
 * @param obj2 - The overriding object.
 * @returns A new object containing all properties from both inputs.
 */
export function mergeInstances<T1, T2>(obj1: T1, obj2: T2): T1 & T2 {
  return {
    ...obj1,
    ...obj2,
  };
}

/**
 * Merges three object instances into a single combined type.
 *
 * Performs a shallow merge, with properties from later objects overwriting earlier ones.
 *
 * @param obj1 - The base object.
 * @param obj2 - The first overriding object.
 * @param obj3 - The final overriding object.
 * @returns A new object containing all properties from the three inputs.
 */
export function merge3Instances<T1, T2, T3>(
  obj1: T1,
  obj2: T2,
  obj3: T3,
): T1 & T2 & T3 {
  return {
    ...obj1,
    ...obj2,
    ...obj3,
  };
}
