import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  ExposeVideoFunction,
  Video,
  VideoAbstract,
  VideoOutput,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { parseBuffer } from 'music-metadata';

import pLimit from 'p-limit';
import { FalService } from '@gitroom/nestjs-libraries/openai/fal.service';
import { IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import {
  FfmpegService,
  ffmpegInstalled,
  SLIDES_FADE_SECONDS,
  SLIDES_NARRATION_DELAY_SECONDS,
  slideSchedule,
} from '@gitroom/nestjs-libraries/media/ffmpeg.service';
import {
  downloadToFile,
  uploadTempDir,
} from '@gitroom/nestjs-libraries/upload/uploaded.file';
const limit = pLimit(2);

// ElevenLabs reports quota and permission problems as 401 with the reason in
// the body, as either { detail: { status, message } } or { detail: 'text' }
async function elevenLabsError(response: Response) {
  const { detail } = await response.json().catch(() => ({ detail: undefined }));
  const reason =
    typeof detail === 'string'
      ? detail
      : detail?.message || detail?.status || response.statusText;
  return `ElevenLabs ${response.status}: ${reason}`;
}

async function getAudioDuration(buffer: Buffer): Promise<number> {
  const metadata = await parseBuffer(buffer, 'audio/mpeg');
  return metadata.format.duration || 0;
}

/** Each slide stays one second past its narration before the next fades in. */
const SLIDE_TAIL_SECONDS = 1;
/** A generated slide image is small; anything larger is not the image we asked for. */
const MAX_SLIDE_IMAGE_BYTES = 32 * 1024 * 1024;

class ImagesSlidesParams {
  @JSONSchema({
    description:
      'An ElevenLabs voice id from the loadVoices helper (videoFunctionTool). Required.',
  })
  @IsString()
  voice: string;

  @JSONSchema({
    description:
      'What the video should say and show, as plain text: the narration is written from it and each sentence becomes a slide with a generated image. Not JSON.',
  })
  @IsString()
  prompt: string;
}

@Video({
  identifier: 'image-text-slides',
  title: 'Image Text Slides',
  description: 'Generate videos slides from images and text, Don\'t break down the slides, provide only the first slide information',
  placement: 'text-to-image',
  tools: [{ functionName: 'loadVoices', output: 'voice id' }],
  dto: ImagesSlidesParams,
  trial: true,
  // The video is assembled by the ffmpeg on the image; the keys are for the
  // slide text (OpenAI), the pictures (fal) and the narration (ElevenLabs).
  available:
    !!process.env.ELEVENSLABS_API_KEY &&
    !!process.env.OPENAI_API_KEY &&
    !!process.env.FAL_KEY &&
    ffmpegInstalled(),
})
export class ImagesSlides extends VideoAbstract<ImagesSlidesParams> {
  override dto = ImagesSlidesParams;
  constructor(
    private _openaiService: OpenaiService,
    private _falService: FalService,
    private _ffmpeg: FfmpegService
  ) {
    super();
  }

  // One price whatever the length: the slides are three to five, each an
  // image and a narration, and what they cost together stays under this.
  cost() {
    return 1400;
  }

  async process(
    output: 'vertical' | 'horizontal',
    customParams: ImagesSlidesParams
  ): Promise<VideoOutput> {
    const list = await this._openaiService.generateSlidesFromText(
      customParams.prompt
    );

    // The spool directory is made on first use, as the upload interceptor does.
    await fsp.mkdir(uploadTempDir(), { recursive: true });
    const dir = await fsp.mkdtemp(join(uploadTempDir(), 'pq-slides-'));
    try {
      // Plain async calls so a failed image or voice request rejects
      // Promise.all and fails the job, instead of a promise that never settles
      // and a job that hangs until the workflow times out. Every input lands
      // in the job's own directory: ffmpeg reads files, not URLs.
      const slides = await Promise.all(
        list.map(async (current, index) => {
          const imagePath = join(dir, `img_${index}.jpg`);
          const audioPath = join(dir, `aud_${index}.mp3`);
          const [, len] = await Promise.all([
            (async () => {
              const url = await this._falService.generateImageFromText(
                'ideogram/v2',
                current.imagePrompt,
                output === 'vertical'
              );
              await downloadToFile(url, imagePath, MAX_SLIDE_IMAGE_BYTES);
            })(),
            (async () => {
              const response = await limit(() =>
                fetch(
                  `https://api.elevenlabs.io/v1/text-to-speech/${customParams.voice}?output_format=mp3_44100_128`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
                    },
                    body: JSON.stringify({
                      text: current.voiceText,
                      model_id: 'eleven_multilingual_v2',
                    }),
                    signal: AbortSignal.timeout(60000),
                  }
                )
              );

              if (!response.ok) {
                throw new Error(await elevenLabsError(response));
              }

              const buffer = Buffer.from(await response.arrayBuffer());
              await fsp.writeFile(audioPath, buffer);
              return getAudioDuration(buffer);
            })(),
          ]);
          return {
            imagePath,
            audioPath,
            durationSeconds: len + SLIDE_TAIL_SECONDS,
            text: current.voiceText,
          };
        })
      );

      // A cue runs from the moment its narration starts (the slide has been
      // up for the delay) to the moment the narration ends, which is where
      // the fade into the next slide begins.
      const { starts } = slideSchedule(slides.map((s) => s.durationSeconds));
      const outputPath = join(dir, 'slides.mp4');
      await this._ffmpeg.assembleSlides({
        slides,
        orientation: output,
        subtitles: slides.map((slide, index) => ({
          startSeconds: starts[index] + SLIDES_NARRATION_DELAY_SECONDS,
          endSeconds: starts[index] + slide.durationSeconds - SLIDES_FADE_SECONDS,
          text: slide.text,
        })),
        outputPath,
      });
      // The inputs are not needed once the video exists; the directory goes
      // with the video when the caller has moved it into storage.
      await Promise.all(
        slides.flatMap((s) => [s.imagePath, s.audioPath]).map((f) =>
          fsp.rm(f, { force: true })
        )
      );
      return { localPath: outputPath };
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  @ExposeVideoFunction()
  async loadVoices(data: any) {
    const response = await fetch(
      'https://api.elevenlabs.io/v2/voices?page_size=40&category=premade',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw new Error(await elevenLabsError(response));
    }

    const { voices } = await response.json();

    return {
      voices: voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        preview_url: voice.preview_url,
      })),
    };
  }
}
