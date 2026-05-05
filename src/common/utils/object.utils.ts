export function mergeInstances<T1, T2>(obj1: T1, obj2: T2): T1 & T2 {
  return {
    ...obj1,
    ...obj2,
  };
}

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
