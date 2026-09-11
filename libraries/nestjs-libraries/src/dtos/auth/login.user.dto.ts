import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
// The enums module has no Prisma runtime behind it, so the browser can load it
// too (the register form validates with these DTOs).
import { Provider } from '@gitroom/nestjs-libraries/database/prisma/generated/enums';

export class LoginUserDto {
  @IsString()
  @IsDefined()
  @ValidateIf((o) => !o.providerToken)
  @MinLength(3)
  password: string;

  @IsString()
  @IsDefined()
  @IsEnum(Provider)
  provider: Provider;

  @IsString()
  @IsDefined()
  @ValidateIf((o) => !o.password)
  providerToken: string;

  @IsEmail()
  @IsDefined()
  email: string;

  datafast_visitor_id: string;
}
