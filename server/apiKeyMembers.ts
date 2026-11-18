/**
 * Each workspace API key acts as a hidden member of its workspace (workspace_members.user_id =
 * 'apikey_<key id>'). Kept apart from apiKeys.ts so membership code can use it without an import cycle.
 */
export const KEY_MEMBER_PREFIX = 'apikey_';
/** SQL LIKE pattern matching key members (the underscore escaped). */
export const KEY_MEMBER_LIKE = 'apikey\\_%';

export const isKeyMember = (uid: string) => uid.startsWith(KEY_MEMBER_PREFIX);
export const keyMemberId = (keyId: string) => `${KEY_MEMBER_PREFIX}${keyId}`;
