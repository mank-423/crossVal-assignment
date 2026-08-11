import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { AppConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersRepository } from './users.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<{ app: AppConfig }, true>) => {
        const jwt = config.get('app', { infer: true }).jwt;
        return {
          secret: jwt.secret,
          // jsonwebtoken types expiresIn as a template-literal union ("7d", "24h", ...).
          // The value is configuration, so its exact literal is unknowable at compile time;
          // an invalid string throws at signing, which the boot-time smoke test would catch.
          signOptions: { expiresIn: jwt.expiresIn as JwtSignOptions['expiresIn'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UsersRepository],
  // Orders and payments need nothing from auth beyond the guard, which is exported here so
  // they do not have to re-declare the passport strategy.
  exports: [AuthService, UsersRepository],
})
export class AuthModule {}
