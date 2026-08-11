import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

export interface UserRow {
  id: number;
  email: string;
  created_at: Date;
}

export interface UserWithHashRow extends UserRow {
  password_hash: string;
}

/**
 * Binds parameters to the statements in `database/sql/users`. No SQL text lives here.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  create(email: string, passwordHash: string): Promise<UserRow | null> {
    return this.db.runOne<UserRow>('users/insert', [email, passwordHash]);
  }

  findByEmail(email: string): Promise<UserWithHashRow | null> {
    return this.db.runOne<UserWithHashRow>('users/find_by_email', [email]);
  }

  findById(id: number): Promise<UserRow | null> {
    return this.db.runOne<UserRow>('users/find_by_id', [id]);
  }
}
