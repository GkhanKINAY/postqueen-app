import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshPostMetricsDto {
  // One channel, or every manual-refresh channel of the organization when
  // left out.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrationId?: string;
}
