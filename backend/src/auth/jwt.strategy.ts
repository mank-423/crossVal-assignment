import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../config/configuration';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { UsersRepository } from './users.repository';

interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<{ app: AppConfig }, true>,
    private readonly users: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('app', { infer: true }).jwt.secret,
    });
  }

  /**
   * Runs after the signature and expiry check.
   *
   * The user is re-read from the database rather than trusted from the token body: a deleted
   * account would otherwise keep working until its token expired, and every downstream query
   * is scoped by this id.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.users.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('This account no longer exists.');
    }

    return { id: user.id, email: user.email };
  }
}
