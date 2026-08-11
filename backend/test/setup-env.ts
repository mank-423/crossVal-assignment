/**
 * Runs before the test framework and before any application module is imported.
 *
 * NODE_ENV must be `test` at this point: loadConfiguration reads TEST_DATABASE_URL only in
 * that mode, and setting it inside a spec file would be too late — the import of AppModule
 * would already have resolved the development database, and the suite would truncate real
 * data.
 */
process.env.NODE_ENV = 'test';
