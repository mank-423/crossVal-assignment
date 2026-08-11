-- Look up a user for sign-in. Returns the hash so the service can verify the password.
-- $1 email (CITEXT column, so the comparison is case-insensitive)
SELECT id, email, password_hash, created_at
FROM users
WHERE email = $1;
