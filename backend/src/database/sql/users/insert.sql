-- Register a new user.
-- $1 email, $2 password_hash
-- The unique index on users.email is what actually prevents duplicates; the service
-- translates the resulting violation into EMAIL_ALREADY_REGISTERED.
INSERT INTO users (email, password_hash)
VALUES ($1, $2)
RETURNING id, email, created_at;
