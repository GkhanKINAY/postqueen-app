import { IsDefined, IsString, MaxLength } from 'class-validator';

// The form body a platform posts to its deletion and deauthorize callbacks.
export class PlatformCallbackDto {
  @IsString()
  @IsDefined()
  @MaxLength(8192)
  signed_request: string;
}
