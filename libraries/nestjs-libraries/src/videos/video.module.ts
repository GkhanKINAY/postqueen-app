import { Global, Module } from '@nestjs/common';
import { ImagesSlides } from '@gitroom/nestjs-libraries/videos/images-slides/images.slides';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { Seedance } from '@gitroom/nestjs-libraries/videos/seedance/seedance';
import { FfmpegService } from '@gitroom/nestjs-libraries/media/ffmpeg.service';

@Global()
@Module({
  providers: [FfmpegService, ImagesSlides, Seedance, VideoManager],
  get exports() {
    return this.providers;
  },
})
export class VideoModule {}
