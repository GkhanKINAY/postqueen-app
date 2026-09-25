import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailUnsubscribeDto {
  @IsString()
  @IsDefined()
  @MinLength(5)
  @MaxLength(2000)
  token: string;
}
