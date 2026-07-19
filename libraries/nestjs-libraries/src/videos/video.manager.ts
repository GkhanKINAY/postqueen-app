import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import {
  VideoAbstract,
  VideoParams,
} from '@gitroom/nestjs-libraries/videos/video.interface';

@Injectable()
export class VideoManager {
  constructor(private _moduleRef: ModuleRef) {}

  getAllVideos(): {
    identifier: string;
    title: string;
    dto: any;
    description: string;
    target: VideoAbstract<any>,
    tools: { functionName: string; output: string }[];
    placement: string;
    trial: boolean;
  }[] {
    return (Reflect.getMetadata('video', VideoAbstract) || [])
      .filter((f: any) => f.available)
      .map((p: any) => ({
        target: p.target,
        identifier: p.identifier,
        title: p.title,
        tools: p.tools,
        dto: p.dto,
        description: p.description,
        placement: p.placement,
        trial: p.trial,
      }));
  }

  checkAvailableVideoFunction(method: any) {
    const videoFunction = Reflect.getMetadata('video-function', method);
    return !videoFunction;
  }

  getVideoByName(
    identifier: string
  ): (VideoParams & { instance: VideoAbstract<any> }) | undefined {
    const video = (Reflect.getMetadata('video', VideoAbstract) || []).find(
      // `available` is the provider's API-key check. getAllVideos() filters on
      // it, so routes that take a raw identifier string used to reach providers
      // the operator never configured. An unknown identifier was worse still:
      // spreading `undefined` and reading `video.target` threw a bare
      // TypeError, which also made every `if (!video)` guard downstream dead
      // code. Returning undefined brings those guards to life.
      (p: any) => p.identifier === identifier && p.available
    );

    if (!video) {
      return undefined;
    }

    return {
      ...video,
      instance: this._moduleRef.get(video.target, {
        strict: false,
      }),
    };
  }
}
