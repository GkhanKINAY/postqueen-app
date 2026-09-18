import { IsNumber, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

export class SaveMediaInformationDto {
  @IsString()
  id: string;

  @IsString()
  alt: string;

  // A self-hosted install serves uploads from a host without a TLD
  // (localhost, a LAN name); the default check refused every poster there.
  @IsUrl({ require_tld: false })
  @ValidateIf((o) => !!o.thumbnail)
  thumbnail: string;

  @IsNumber()
  @ValidateIf((o) => !!o.thumbnailTimestamp)
  thumbnailTimestamp: number;
}
