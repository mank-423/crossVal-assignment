import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { AuthResponse, AuthenticatedUser } from '../shared';

import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../common/errors/app-error';
import { isPgError, PG_ERROR } from '../database/database.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { UserRow, UsersRepository } from './users.repository';

/** Work factor for bcrypt. 12 is a few hundred milliseconds — costly to brute force, fine for a login. */
const BCRYPT_ROUNDS = 12;

/**
 * A valid bcrypt hash of a value nobody can supply.
 *
 * When the email is unknown, sign-in still runs a comparison against this. Returning early
 * instead would make "no such user" measurably faster than "wrong password", which is a
 * usable oracle for discovering which addresses have accounts.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.5xtGWDMhy4nGE1EEfBWyMBcaWaSBGLu';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
  ) {}

  async signUp(dto: SignUpDto): Promise<AuthResponse> {
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.users.create(dto.email, passwordHash);

      if (!user) {
        throw new Error('User insert returned no row.');
      }

      return this.buildAuthResponse(user);
    } catch (error) {
      // Checking for an existing row first would still race two concurrent sign-ups for the
      // same address. The unique index decides; this translates its verdict.
      if (isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) {
        throw new EmailAlreadyRegisteredError(dto.email);
      }
      throw error;
    }
  }

  async signIn(dto: SignInDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await compare(dto.password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    return this.buildAuthResponse(user);
  }

  async findById(id: number): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(id);
    return user ? toAuthenticatedUser(user) : null;
  }

  private async buildAuthResponse(user: UserRow): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    return { accessToken, user: toAuthenticatedUser(user) };
  }
}

function toAuthenticatedUser(user: UserRow): AuthenticatedUser {
  return {
    // Serialised as a string: ids are opaque handles to a client, and a bigint that grows past
    // 2^53 would start losing precision in JSON.
    id: String(user.id),
    email: user.email,
    createdAt: user.created_at.toISOString(),
  };
}
