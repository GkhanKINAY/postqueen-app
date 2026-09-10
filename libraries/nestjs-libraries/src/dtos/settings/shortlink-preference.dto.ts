import { IsEnum } from 'class-validator';
import { ShortLinkPreference } from '@gitroom/nestjs-libraries/database/prisma/generated/enums';

export class ShortlinkPreferenceDto {
  @IsEnum(ShortLinkPreference)
  shortlink: ShortLinkPreference;
}

