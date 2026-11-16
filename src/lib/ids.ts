/** Collision-safe ids for client-created records (API id safe: [A-Za-z0-9_-]). */
export const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
