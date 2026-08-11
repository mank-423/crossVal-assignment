-- Cheapest possible round trip that proves the connection is alive and the pool can hand out
-- a working client. Used by the health endpoint.
SELECT 1 AS ok;
