import { Injectable, Type, ValidationPipe } from '@nestjs/common';

export type URL = string;

/**
 * What a generator hands back: a URL the app downloads into storage (a
 * provider's own CDN), or a file it rendered itself, which the app moves
 * into storage and then deletes with its directory.
 */
export type VideoOutput = URL | { localPath: string };

export abstract class VideoAbstract<T> {
  dto: Type<T>;

  async processAndValidate(customParams?: T) {
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

  abstract process(
    output: 'vertical' | 'horizontal',
    customParams?: T
  ): Promise<VideoOutput>;

  /**
   * What generating this video costs, in hundredths of a credit, for these
   * parameters. Each generator prices itself: what a provider charges for a
   * second of video, and which options change it, is the generator's to know.
   */
  abstract cost(output: 'vertical' | 'horizontal', customParams?: T): number;
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
