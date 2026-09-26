import {
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GeneratorDto {
  // The request reaches several model calls at a fixed price.
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  research: string;

  @IsBoolean()
  isPicture: boolean;

  @IsString()
  @IsIn(['one_short', 'one_long', 'thread_short', 'thread_long'])
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';

  @IsString()
  @IsIn(['personal', 'company'])
  tone: 'personal' | 'company';
}
