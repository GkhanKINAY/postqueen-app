import {
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { Type } from 'class-transformer';

// YouTube caps the combined length of all tags at 500 characters, and counts
// the comma between two tags toward it. Tags containing whitespace are
// wrapped in quotes by YouTube, which adds two extra characters per tag.
export const YOUTUBE_TAGS_MAX_LENGTH = 500;

export const YOUTUBE_TAGS_TOO_LONG = `YouTube tags can total at most ${YOUTUBE_TAGS_MAX_LENGTH} characters. Commas between tags count, and a tag with a space counts 2 extra. Remove some tags.`;

export function getYoutubeTagsLength(tags: YoutubeTagsSettings[]): number {
  return (tags ?? []).reduce((total, tag, index) => {
    const label = tag?.label ?? '';
    return (
      total + label.length + (/\s/.test(label) ? 2 : 0) + (index > 0 ? 1 : 0)
    );
  }, 0);
}

@ValidatorConstraint({ name: 'IsYoutubeTagsLength', async: false })
export class IsYoutubeTagsLengthConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (!Array.isArray(value)) {
      return true;
    }
    return getYoutubeTagsLength(value) <= YOUTUBE_TAGS_MAX_LENGTH;
  }

  defaultMessage(_args: ValidationArguments): string {
    return YOUTUBE_TAGS_TOO_LONG;
  }
}

export function IsYoutubeTagsLength(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsYoutubeTagsLengthConstraint,
    });
  };
}

export class YoutubeTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
}

export class YoutubeSettingsDto {
  // Any UTF-8 but < and > (videos resource); YouTube answers invalidTitle
  // after the video is already uploaded.
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, {
    message: 'YouTube titles cannot contain < or >',
  })
  @IsDefined()
  title: string;

  @IsIn(['public', 'private', 'unlisted'])
  @IsDefined()
  type: string;

  @IsIn(['yes', 'no'])
  @IsOptional()
  selfDeclaredMadeForKids: 'no' | 'yes';

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  thumbnail?: MediaDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @IsYoutubeTagsLength()
  @Type(() => YoutubeTagsSettings)
  tags: YoutubeTagsSettings[];
}
