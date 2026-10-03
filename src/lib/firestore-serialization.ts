export function serializeFirestore<T>(value: T): T {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString() as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestore(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        serializeFirestore(item),
      ]),
    ) as T;
  }
  return value;
}
