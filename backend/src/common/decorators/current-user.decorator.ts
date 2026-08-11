import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The authenticated principal, attached to the request by JwtStrategy. */
export interface RequestUser {
  id: number;
  email: string;
}

/**
 * Injects the authenticated user into a handler.
 *
 * Every data-touching handler takes this and passes `user.id` into the query, so ownership is
 * a parameter of the SQL rather than a check someone has to remember to write.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();

    if (!request.user) {
      // Only reachable if a controller uses this decorator without the auth guard, which is a
      // wiring mistake: fail loudly rather than run a query with `undefined` as the owner.
      throw new Error(
        'CurrentUser used on a route with no authentication guard. Add @UseGuards(JwtAuthGuard).',
      );
    }

    return request.user;
  },
);
