import {
  IsDefined,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class DribbbleDto {
  @IsString()
  @IsDefined()
  @MinLength(1, {
    message: 'Title is required',
  })
  title: string;

  // The id of a team from the picker (Dribbble's create-shot `team_id`).
  // It used to demand a URL, which the picker never stores, so any team
  // choice failed validation.
  @IsString()
  @IsOptional()
  team: string;
}
