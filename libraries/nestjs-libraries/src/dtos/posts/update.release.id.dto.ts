import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateReleaseIdDto {
  @IsString()
  @IsNotEmpty()
  releaseId: string;
}
