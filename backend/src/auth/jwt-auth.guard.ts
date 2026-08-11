import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid bearer token. Applied per controller rather than globally so that adding
 * a public route is a deliberate act instead of a forgotten decorator.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
