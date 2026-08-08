import {
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSafeWebhookUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

export class WebhooksIntegrationDto {
  @IsString()
  @IsDefined()
  id: string;
}

export class WebhooksDto {
  id: string;

  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'Webhook URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;

  // Without @IsArray/@ValidateNested the per-element `id` rule never runs and
  // the repository maps over unvalidated input — AutopostDto already has both.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhooksIntegrationDto)
  @IsDefined()
  integrations: WebhooksIntegrationDto[];
}

export class OnlyURL {
  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;
}

export class UpdateDto {
  @IsString()
  @IsDefined()
  id: string;

  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'Webhook URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;

  // Without @IsArray/@ValidateNested the per-element `id` rule never runs and
  // the repository maps over unvalidated input — AutopostDto already has both.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhooksIntegrationDto)
  @IsDefined()
  integrations: WebhooksIntegrationDto[];
}
