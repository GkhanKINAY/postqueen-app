import {
  IsDefined,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  Validate,
} from 'class-validator';
import { ValidUrlExtension, ValidUrlPath } from '@gitroom/helpers/utils/valid.url.path';

export class MediaDto {
  @IsString()
  @IsDefined()
  id: string;

  @IsString()
  @IsDefined()
  @Validate(ValidUrlPath)
  @Validate(ValidUrlExtension)
  path: string;

  @ValidateIf((o) => o.alt)
  @IsString()
  @MaxLength(1000)
  alt?: string;

  @ValidateIf((o) => o.thumbnail)
  @IsUrl({ require_tld: false })
  thumbnail?: string;
}
