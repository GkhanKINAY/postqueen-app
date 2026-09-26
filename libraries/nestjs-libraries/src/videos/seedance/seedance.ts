import {
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';
import { BadRequestException } from '@nestjs/common';

const MODELS = ['fast', 'standard', 'mini'] as const;
const RESOLUTIONS = ['480p', '720p', '1080p'] as const;
const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4'] as const;
type SeedanceModel = (typeof MODELS)[number];
type SeedanceResolution = (typeof RESOLUTIONS)[number];

/**
 * Credits a second of video costs, in hundredths, by model and resolution:
 * EvoLink's price per second times the rate every credit cost is set by
 * (25 credits a dollar), read from its pricing pages on 2026-09-26. A
 * resolution a model does not offer is missing, and refused. Audio is free.
 */
const PER_SECOND: Record<
  SeedanceModel,
  Partial<Record<SeedanceResolution, number>>
> = {
  mini: { '480p': 50, '720p': 100 },
  fast: { '480p': 185, '720p': 400 },
  standard: { '480p': 235, '720p': 500, '1080p': 1250 },
};

// What a request that names nothing gets, which is what every video was
// before these could be chosen.
const DEFAULTS = {
  model: 'fast' as SeedanceModel,
  resolution: '720p' as SeedanceResolution,
  duration: 8,
};

class Image {
  @IsString()
  id: string;

  @IsString()
  path: string;
}
class SeedanceParams {
  @JSONSchema({
    description:
      'One scene of about 8 seconds as a visual brief: camera, subject, motion, light, atmosphere. Plain text, no JSON, no on-screen text or logos.',
  })
  @IsString()
  prompt: string;

  @JSONSchema({
    description:
      'Up to three reference images from the media library as {id, path}; an empty array for text to video.',
  })
  @Type(() => Image)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMaxSize(3)
  images: Image[];

  @JSONSchema({
    description:
      'fast (default), standard (sharper, and the only one with 1080p) or mini. Standard costs the most credits per second, mini the least.',
  })
  @IsOptional()
  @IsIn(MODELS)
  model?: SeedanceModel;

  @JSONSchema({
    description:
      '480p, 720p (default) or 1080p (standard only). Higher costs more credits.',
  })
  @IsOptional()
  @IsIn(RESOLUTIONS)
  resolution?: SeedanceResolution;

  @JSONSchema({
    description: 'Length in seconds, 4 to 15 (default 8). Credits are per second.',
  })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(15)
  duration?: number;

  @JSONSchema({
    description:
      'Frame shape. Left out, it follows the vertical or horizontal output.',
  })
  @IsOptional()
  @IsIn(ASPECT_RATIOS)
  aspectRatio?: (typeof ASPECT_RATIOS)[number];

  @JSONSchema({ description: 'Generate a sound track (default true, free).' })
  @IsOptional()
  @IsBoolean()
  audio?: boolean;
}

// A form or an API client can post its choices as text ("8", "false"), and
// validation does not write its conversion back, so they are converted here.
const settings = (params?: SeedanceParams) => ({
  model: params?.model || DEFAULTS.model,
  resolution: params?.resolution || DEFAULTS.resolution,
  duration: Number(params?.duration) || DEFAULTS.duration,
  audio: String(params?.audio ?? true) !== 'false',
});

@Video({
  identifier: 'seedance',
  title: 'Seedance 2.0 (Audio + Video)',
  description: 'Generate videos with the most advanced video model.',
  placement: 'text-to-image',
  dto: SeedanceParams,
  tools: [],
  trial: false,
  available: !!process.env.EVOLINK_API_KEY,
})
export class Seedance extends VideoAbstract<SeedanceParams> {
  override dto = SeedanceParams;

  override async processAndValidate(customParams?: SeedanceParams) {
    await super.processAndValidate(customParams);
    const { model, resolution } = settings(customParams);
    if (!PER_SECOND[model]?.[resolution]) {
      throw new BadRequestException(
        `Seedance ${model} does not offer ${resolution}`
      );
    }
  }

  cost(output: 'vertical' | 'horizontal', customParams?: SeedanceParams) {
    // Priced before validation too (the quote): an unknown choice prices at
    // nothing rather than failing, and the request itself is refused.
    const { model, resolution, duration } = settings(customParams);
    return Math.ceil((PER_SECOND[model]?.[resolution] || 0) * duration);
  }

  async process(
    output: 'vertical' | 'horizontal',
    customParams: SeedanceParams
  ): Promise<URL> {
    const imageUrls = customParams?.images?.map((p) => p.path) || [];
    const { model, resolution, duration, audio } = settings(customParams);
    const value = await (
      await fetch('https://api.evolink.ai/v1/videos/generations', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.EVOLINK_API_KEY}`,
        },
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: `seedance-2.0-${model === 'standard' ? '' : `${model}-`}${
            imageUrls.length ? 'reference' : 'text'
          }-to-video`,
          prompt: customParams.prompt,
          ...(imageUrls.length ? { image_urls: imageUrls } : {}),
          aspect_ratio:
            customParams.aspectRatio ||
            (output === 'horizontal' ? '16:9' : '9:16'),
          duration,
          quality: resolution,
          generate_audio: audio,
        }),
      })
    ).json();

    const taskId = value?.id;
    if (!taskId) {
      throw new Error(
        value?.error
          ? `${value.error.code}: ${value.error.message}`
          : `Failed to generate video`
      );
    }

    console.log('seedance taskId', taskId);
    let attempts = 0;
    const maxAttempts = 180; // ~30 minutes at 10s interval
    while (true) {
      if (attempts++ >= maxAttempts) {
        throw new Error('Video generation timed out');
      }

      console.log('waiting for video to be ready');
      const data = await (
        await fetch('https://api.evolink.ai/v1/tasks/' + taskId, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.EVOLINK_API_KEY}`,
          },
          signal: AbortSignal.timeout(30000),
        })
      ).json();

      if (data?.status === 'completed') {
        const videoUrl = data?.results || [];
        if (videoUrl.length > 0) {
          return videoUrl[0];
        }
        throw new Error('Video generation succeeded but no video URL returned');
      }

      if (data?.status !== 'pending' && data?.status !== 'processing') {
        throw new Error(
          data?.error
            ? `${data.error.code}: ${data.error.message}`
            : `Video generation failed (status ${data?.status})`
        );
      }

      await timer(10000);
    }
  }
}
