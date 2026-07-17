import { IsDefined, IsEmail, IsOptional, IsString } from 'class-validator';

export class OtpRequestDto {
  @IsEmail()
  @IsDefined()
  email: string;

  // Cloudflare Turnstile / captcha token, verified by the Guard service.
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
