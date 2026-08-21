/**
 * Normalizes Google auth ID-token claims into canonical GlobalChat identity.
 *
 * Deliberately claims-only: database.rules.json validates profile/message
 * identity against auth.token.name / auth.token.picture, so sourcing these
 * from anywhere else (e.g. the Firebase User object) produces writes the
 * server rejects with PERMISSION_DENIED. To get real names/photos into the
 * claims, see syncGoogleProfileToUserRecord in ./firebase.js.
 *
 * @param {string} uid Firebase user UID
 * @param {Object} [claims={}] Decoded ID-token claims (e.g. from getIdTokenResult)
 * @returns {{ uid: string, displayName: string, photoURL: string|null } | null}
 */
export function getGoogleTokenIdentity(uid, claims = {}) {
    if (!uid) return null;
    const claimedName = typeof claims.name === 'string' ? claims.name : '';
    const displayName = claimedName && claimedName.length <= 80 ? claimedName : 'Google User';
    const picture = typeof claims.picture === 'string' && /^https:\/\//i.test(claims.picture)
        ? claims.picture
        : null;
    return { uid, displayName, photoURL: picture };
}
