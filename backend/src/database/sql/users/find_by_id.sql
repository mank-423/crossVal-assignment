-- Resolve the authenticated user from a token subject.
-- Deliberately omits password_hash: this feeds request context, which has no use for it.
-- $1 user id
SELECT id, email, created_at
FROM users
WHERE id = $1;
