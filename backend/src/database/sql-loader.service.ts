import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Reads every `.sql` file under `database/sql` and serves them by name.
 *
 * Queries live in `.sql` files rather than in template literals so they can be opened,
 * diffed, and run in any SQL tool without a TypeScript build in between, and so the
 * repository layer contains only parameter binding.
 *
 * Everything is loaded once at boot rather than lazily on first use. A typo in a query name
 * then fails at startup, where it is obvious, instead of the first time some rarely-hit
 * endpoint is called in production.
 */
@Injectable()
export class SqlLoaderService implements OnModuleInit {
  private readonly logger = new Logger(SqlLoaderService.name);
  private readonly statements = new Map<string, string>();

  /**
   * Resolved relative to the compiled file, so it works from `src` under ts-jest and from
   * `dist` in production, where nest-cli copies the `.sql` files across as assets.
   */
  private readonly root = join(__dirname, 'sql');

  onModuleInit(): void {
    this.loadAll();
  }

  /**
   * @param name Path below `database/sql` without the extension, e.g. `orders/find_by_user`.
   */
  get(name: string): string {
    const statement = this.statements.get(name);

    if (statement === undefined) {
      throw new Error(
        `No SQL statement named "${name}". Available: ${[...this.statements.keys()].sort().join(', ')}`,
      );
    }

    return statement;
  }

  /** Exposed for the startup self-check in tests. */
  get loadedNames(): string[] {
    return [...this.statements.keys()].sort();
  }

  private loadAll(): void {
    this.statements.clear();

    for (const file of this.walk(this.root)) {
      const name = relative(this.root, file)
        .replace(/\.sql$/i, '')
        // Normalise Windows separators so query names are identical on every platform.
        .split(sep)
        .join('/');

      this.statements.set(name, readFileSync(file, 'utf8'));
    }

    if (this.statements.size === 0) {
      throw new Error(
        `No .sql files found under ${this.root}. If this is a production build, check that ` +
          `nest-cli.json still copies database/sql/**/*.sql into dist.`,
      );
    }

    this.logger.log(`Loaded ${this.statements.size} SQL statements`);
  }

  private *walk(directory: string): Generator<string> {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);

      if (statSync(path).isDirectory()) {
        yield* this.walk(path);
      } else if (entry.toLowerCase().endsWith('.sql')) {
        yield path;
      }
    }
  }
}
