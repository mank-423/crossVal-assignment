import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email address is too long.' })
  // Normalised on the way in so the stored value matches what the user typed, minus stray
  // whitespace. Case-insensitive uniqueness is the CITEXT column's job, not this one's.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  // bcrypt silently truncates beyond 72 bytes, which would make two different long passwords
  // interchangeable. Rejected outright instead.
  @MaxLength(72, { message: 'Password must be at most 72 characters.' })
  password!: string;
}

export class SignInDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email!: string;

  @IsString({ message: 'Password is required.' })
  password!: string;
}
