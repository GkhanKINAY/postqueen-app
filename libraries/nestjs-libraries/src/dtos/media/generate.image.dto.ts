import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import {
  IMAGE_QUALITIES,
  ImageQuality,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

/**
 * The brief for one AI image. `orientation` picks the OpenAI size
 * (square 1024x1024, portrait 1024x1536, landscape 1536x1024); it used to be
 * fixed to square on this route while the agent's tool already chose it from
 * the platform. `quality` picks the model's quality and, with the shape, what
 * the image costs in credits (medium when left out).
 */
export class GenerateImageDto {
  @IsString()
  @MinLength(1)
  prompt: string;

  @IsOptional()
  @IsIn(['square', 'portrait', 'landscape'])
  orientation?: 'square' | 'portrait' | 'landscape';

  @IsOptional()
  @IsIn(IMAGE_QUALITIES)
  quality?: ImageQuality;
}
