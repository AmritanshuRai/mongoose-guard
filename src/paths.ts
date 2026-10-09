export function join(base: string, key: string | number): string {
  return base ? `${base}.${key}` : String(key);
}
