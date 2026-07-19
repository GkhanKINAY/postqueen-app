import { IsDefined, IsEmail, IsString, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsEmail()
  @IsDefined()
  email: string;

  @IsString()
  @IsDefined()
  @Length(6, 6)
  code: string;
}
