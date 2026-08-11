import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthResponse, AuthenticatedUser } from '@orders/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signUp(@Body() dto: SignUpDto): Promise<AuthResponse> {
    return this.auth.signUp(dto);
  }

  @Post('login')
  // 200 rather than the POST default of 201: signing in returns a token, it does not create
  // a resource at a new location.
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: SignInDto): Promise<AuthResponse> {
    return this.auth.signIn(dto);
  }

  /** Lets the web client restore a session from a stored token without a second endpoint. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    const found = await this.auth.findById(user.id);

    if (!found) {
      // The guard already resolved this user, so absence here means the row vanished between
      // the guard and the handler. Surfacing it as a 500 is honest; pretending otherwise hides
      // a genuine consistency problem.
      throw new Error(`Authenticated user ${user.id} disappeared mid-request.`);
    }

    return found;
  }
}
