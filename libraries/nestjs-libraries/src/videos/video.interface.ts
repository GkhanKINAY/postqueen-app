import { Injectable, Type, ValidationPipe } from '@nestjs/common';
import { CreditPricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export type URL = string;

/**
 * What a generator hands back: a URL the app downloads into storage (a
 * provider's own CDN), or a file it rendered itself, which the app moves
 * into storage and then deletes with its directory.
 */
export type VideoOutput = URL | { localPath: string };

export abstract class VideoAbstract<T> {
  dto: Type<T>;

  /**
   * Checks the parameters. `creditPricing` is the organization's price list,
   * for a generator whose defaults depend on it.
   */
  async processAndValidate(customParams?: T, _creditPricing?: CreditPricing) {
    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    await validationPipe.transform(customParams, {
      type: 'body',
      metatype: this.dto,
    });
  }

  /**
   * Makes the video. `creditPricing` is the list it is charged on, so a
   * request that leaves a setting out gets the default it was priced at.
   */
  abstract process(
    output: 'vertical' | 'horizontal',
    customParams: T | undefined,
    creditPricing: CreditPricing
  ): Promise<VideoOutput>;

  /**
   * What generating this video costs, in hundredths of a credit, for these
   * parameters on this price list. Each generator prices itself: what a
   * provider charges for a second of video, and which options change it, is
   * the generator's to know.
   */
  abstract cost(
    output: 'vertical' | 'horizontal',
    customParams: T | undefined,
    creditPricing: CreditPricing
  ): number;
}

export interface VideoParams {
  identifier: string;
  title: string;
  description: string;
  dto: any;
  placement: 'text-to-image' | 'image-to-video' | 'video-to-video';
  tools: { functionName: string; output: string }[];
  available: boolean;
  trial: boolean;
}

export function ExposeVideoFunction(description?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    Reflect.defineMetadata(
      'video-function',
      description || 'true',
      descriptor.value
    );
  };
}

export function Video(params: VideoParams) {
  return function (target: any) {
    // Apply @Injectable decorator to the target class
    Injectable()(target);

    // Retrieve existing metadata or initialize an empty array
    const existingMetadata = Reflect.getMetadata('video', VideoAbstract) || [];

    // Add the metadata information for this method
    existingMetadata.push({ target, ...params });

    // Define metadata on the class prototype (so it can be retrieved from the class)
    Reflect.defineMetadata('video', existingMetadata, VideoAbstract);
  };
}
