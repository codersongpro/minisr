# Security Specification & Invariants

## Data Invariants
1. A TestSession must belong to a valid authenticated user (`userId == request.auth.uid`).
2. Only the owner of a TestSession can read, update, or delete their test progress/results.
3. Timestamps (`createdAt`, `updatedAt`) must be valid strings.

## Test Matrix
- Unauthenticated user read/write -> PERMISSION_DENIED
- Authenticated user reading another user's session -> PERMISSION_DENIED
- Authenticated user creating session with matching userId -> ALLOWED
- Authenticated user updating their own session -> ALLOWED
