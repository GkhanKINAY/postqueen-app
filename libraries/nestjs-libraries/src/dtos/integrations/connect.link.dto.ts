import { IsDefined, IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';
import {
  allProviders,
  EmptySettings,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings';

export class ConnectLinkDto {
  @IsDefined()
  @IsIn(allProviders(EmptySettings).map((p) => p.name), {
    message: `"integration" must be ${allProviders(EmptySettings)
      .map((p) => p.name)
      .join(', ')}`,
  })
  integration: string;

  // Offered as a button once the channel is connected, so only an absolute
  // http(s) URL (the service refuses a fragment or credentials too)
  @IsOptional()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  redirectUrl?: string;
}
