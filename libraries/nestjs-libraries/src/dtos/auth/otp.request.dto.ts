import { IsDefined, IsEmail, IsOptional, IsString } from 'class-validator';

export class OtpRequestDto {
  @IsEmail()
  @IsDefined()
  email: string;

  // Cloudflare Turnstile token. Verified server-side when TURNSTILE_SECRET
  // is set; ignored otherwise.
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
