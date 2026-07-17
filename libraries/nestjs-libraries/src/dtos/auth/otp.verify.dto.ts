import {
  IsDefined,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class OtpVerifyDto {
  @IsEmail()
  @IsDefined()
  email: string;

  @IsString()
  @IsDefined()
  @Length(6, 6)
  code: string;

  // Cloudflare Turnstile / captcha token, verified by the Guard service.
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
