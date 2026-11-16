import { initialWorkspaces, initialLedgerEntries } from '../src/data/initialData';
import type { Workspace, LedgerEntry } from '../src/types';

/**
 * DEMO_MODE only: in-memory copies of the seeded demo data. Shared by every demo visitor and
 * reset on restart. Never used when DEMO_MODE is off.
 */
export const demoWorkspaces = new Map<string, Workspace>(initialWorkspaces.map((w) => [w.id, structuredClone(w)]));

export const demoLedger: LedgerEntry[] = structuredClone(initialLedgerEntries);
