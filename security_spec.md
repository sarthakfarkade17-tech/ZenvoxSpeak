# Security Specification & Hardened Rules Audit

## 1. Data Invariants
1. **Owner-Only Profile Isolation**: A `users/{userId}` document may only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId` and `incoming().uid == request.auth.uid`.
2. **Master Gate on Subcollections**: No `vocabProgress` or `practiceSessions` document may be written unless the parent `users/{userId}` document exists and belongs to `request.auth.uid`.
3. **Immutable Identity & Timestamps**: `uid`, `userId`, `wordId`, `sessionId`, and `createdAt` cannot be modified after creation. All `createdAt`/`updatedAt` timestamps must match `request.time`.
4. **Strict Payload Boundaries**: Every string field enforces `.size()` limits; no unknown shadow fields are permitted (`hasOnly` on create, `affectedKeys().hasOnly` on update).
5. **Verified Auth Mandate**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Fail)
1. Unauthenticated read of `/users/user_1`.
2. Cross-user read of `/users/victim_uid` by `attacker_uid`.
3. Identity spoofing on create: `{ uid: "victim_uid", ... }` written to `/users/attacker_uid`.
4. Unverified email write (`request.auth.token.email_verified = false`).
5. Shadow field injection on create: `{ ..., isAdmin: true }` on `/users/attacker_uid`.
6. Shadow field injection on update: updating `displayName` plus `xpTotal: 9999999` or `ghost: true`.
7. Oversized ID poisoning: document ID > 128 chars or containing `$` / `/`.
8. Oversized string DoS: `summary` > 600 chars or `displayName` > 80 chars.
9. Fake client timestamp: `createdAt` set to a past/future timestamp instead of `request.time`.
10. Immutable field mutation: updating `uid` or `createdAt` on an existing `UserProfile`.
11. Orphaned subcollection write: writing `/users/user_1/vocabProgress/w1` when `/users/user_1` does not exist.
12. Terminal history mutation: updating an existing `PracticeSession` document after creation (sessions are append-only logs).
