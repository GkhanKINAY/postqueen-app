import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MediumTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
}

export class MediumSettingsDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  // `subtitle` was here, required with a 2-character minimum, and
  // `medium.provider.ts` never read it - Medium's API has no such parameter.
  // Removing rather than relaxing is safe: settings are validated with plain
  // `validate(..., { skipMissingProperties: false })` and the global
  // ValidationPipe sets no `whitelist`, so a client still sending `subtitle`
  // has it ignored exactly as the provider already ignored it.

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.canonical && o.canonical.indexOf('(post:') === -1)
  @Matches(
    /^(|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/,
    {
      message: 'Invalid URL',
    }
  )
  canonical?: string;

  @IsString()
  @IsOptional()
  publication?: string;

  @IsArray()
  @ArrayMaxSize(4)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(p => MediumTagsSettings)
  tags: MediumTagsSettings[];
}
