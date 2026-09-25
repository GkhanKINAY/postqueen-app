import { IsOptional, IsString } from 'class-validator';

export class MoltbookDto {
  // Left blank, the post goes to "general": the provider falls back to it and
  // the composer shows it as the placeholder.
  @IsOptional()
  @IsString()
  submolt?: string;
}
