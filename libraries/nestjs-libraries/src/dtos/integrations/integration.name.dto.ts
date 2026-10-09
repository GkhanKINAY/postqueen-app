import { IsDefined, IsString, MaxLength } from 'class-validator';

export class IntegrationNameDto {
  @IsString()
  @IsDefined()
  @MaxLength(100)
  name: string;
}
