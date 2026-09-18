import { Injectable, Logger } from '@nestjs/common';
import { execFile, spawnSync } from 'child_process';
import { promises as fsp } from 'fs';
import { setPriority } from 'os';

/**
 * Everything the app asks of ffmpeg, in one place: what a video is, and the
 * slides video the Image Text Slides generator assembles. ffmpeg and ffprobe
 * are the binaries on the image (Debian's, with libass for burned subtitles);
 * outside the image `FFMPEG_PATH` / `FFPROBE_PATH` point at a build that has
 * it.
 *
 * Nothing here knows about storage, media rows or providers: paths in,
 * paths out.
 */

export type MediaProbe = {
  /** ffprobe's format_name, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  container: string;
  vcodec?: string;
  pixfmt?: string;
  width: number;
  height: number;
  fps: number;
  acodec?: string;
  sampleRate?: number;
  duration: number;
  size: number;
  /** The moov atom sits before the media data, so playback can start at once. */
  faststart: boolean;
};

export type SlidesAssembly = {
  slides: { imagePath: string; audioPath: string; durationSeconds: number }[];
  orientation: 'vertical' | 'horizontal';
  /** Burned in, centred; times in seconds on the assembled timeline. */
  subtitles: { startSeconds: number; endSeconds: number; text: string }[];
  outputPath: string;
};

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly stderrTail: string,
    public readonly timedOut = false,
    public readonly exitCode?: number | null
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

const STDERR_TAIL_BYTES = 4096;
/** Seconds of cross-fade between two slides. */
export const SLIDES_FADE_SECONDS = 0.5;
/** Seconds the narration waits after its slide appears. */
export const SLIDES_NARRATION_DELAY_SECONDS = 0.5;
/** Caption height as a share of the frame height: about 69 px on a 1920-tall frame. */
export const SLIDES_SUBTITLE_FONT_RATIO = 1 / 28;

const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobeBin = () => process.env.FFPROBE_PATH || 'ffprobe';
const ffmpegTimeoutMs = () => Number(process.env.FFMPEG_TIMEOUT_MS) || 20 * 60 * 1000;

/**
 * Whether an ffmpeg that can burn subtitles answers. Synchronous because the
 * video generators declare their availability in a decorator at import time;
 * one spawn per process, a few tens of milliseconds. Homebrew's plain ffmpeg
 * has no libass and so no `subtitles` filter; ffmpeg-full and Debian's do.
 */
export const ffmpegInstalled = (): boolean => {
  const result = spawnSync(ffmpegBin(), ['-hide_banner', '-filters'], {
    timeout: 5000,
    encoding: 'utf8',
  });
  return result.status === 0 && /\bsubtitles\b/.test(result.stdout || '');
};

/**
 * Where each slide starts once the cross-fades overlap them: slide k begins
 * at the sum of the durations before it minus k fades, and the video is that
 * much shorter than the sum of its slides.
 */
export const slideSchedule = (
  durations: number[],
  fade = SLIDES_FADE_SECONDS
): { starts: number[]; total: number } => {
  const starts: number[] = [];
  let at = 0;
  durations.forEach((duration, index) => {
    starts.push(at);
    at += duration - (index < durations.length - 1 ? fade : 0);
  });
  return { starts, total: at };
};

/**
 * Walks the top-level ISO BMFF boxes and answers whether `moov` comes before
 * `mdat`. No ffmpeg, no full read: sixteen bytes per box header, at most a
 * few dozen boxes. Not an mp4 at all reads as "not fast start".
 */
export const isFastStart = async (path: string): Promise<boolean> => {
  const handle = await fsp.open(path, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    let offset = 0;
    const header = Buffer.alloc(16);
    for (let boxes = 0; boxes < 64 && offset + 8 <= fileSize; boxes++) {
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) {
        return false;
      }
      let size = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (size === 1) {
        if (bytesRead < 16) {
          return false;
        }
        size = Number(header.readBigUInt64BE(8));
      } else if (size === 0) {
        // The box runs to the end of the file: moov this late is not fast start.
        return type === 'moov';
      }
      if (type === 'moov') {
        return true;
      }
      if (type === 'mdat') {
        return false;
      }
      if (size < 8) {
        return false;
      }
      offset += size;
    }
    return false;
  } finally {
    await handle.close();
  }
};

/**
 * A path inside a quoted filtergraph option: backslashes and colons carry
 * meaning for the option parser, and a quote can only be written by closing
 * the quoted run around it.
 */
const filterPath = (path: string) =>
  path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");

const frameSize = (orientation: 'vertical' | 'horizontal') =>
  orientation === 'vertical' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };

/** h:mm:ss.cc, rounded to the centisecond first so the parts always agree. */
const assTime = (seconds: number) => {
  const total = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(total / 360000);
  const m = Math.floor((total % 360000) / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

/**
 * The captions as an ASS script with one explicit style, because an SRT plus
 * `force_style` leaves the alignment number to libass's reading (the old SSA
 * numbering puts "5" top-left). PlayRes matches the frame, so the font size
 * is in frame pixels; alignment 5 is centre in the numpad layout the v4+
 * script type declares.
 */
export const subtitlesScript = (
  subtitles: SlidesAssembly['subtitles'],
  orientation: 'vertical' | 'horizontal'
) => {
  const { w, h } = frameSize(orientation);
  const fontSize = Math.round(h * SLIDES_SUBTITLE_FONT_RATIO);
  const margin = Math.round(w * 0.06);
  const lines = subtitles.map((cue) => {
    // Braces open override tags and line breaks end the event; neither is text.
    const text = cue.text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim();
    return `Dialogue: 0,${assTime(cue.startSeconds)},${assTime(cue.endSeconds)},Default,,0,0,0,,${text}`;
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H000000FF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,5,${margin},${margin},${margin},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines,
    '',
  ].join('\n');
};

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private capabilities?: Promise<{ ok: boolean; subtitles: boolean; version: string }>;

  /** What this ffmpeg can do; asked once per process. */
  available() {
    if (!this.capabilities) {
      this.capabilities = (async () => {
        try {
          const version = await this.capture(ffmpegBin(), ['-version']);
          const filters = await this.capture(ffmpegBin(), ['-hide_banner', '-filters']);
          return {
            ok: true,
            subtitles: /\bsubtitles\b/.test(filters),
            version: version.split('\n')[0] || '',
          };
        } catch {
          return { ok: false, subtitles: false, version: '' };
        }
      })();
    }
    return this.capabilities;
  }

  async probe(input: string): Promise<MediaProbe> {
    const raw = await this.capture(ffprobeBin(), [
      '-v',
      'error',
      '-show_entries',
      'format=format_name,duration,size:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,sample_rate',
      '-of',
      'json',
      input,
    ]);
    const parsed = JSON.parse(raw);
    const streams: any[] = parsed.streams || [];
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    const rate = (value?: string) => {
      const [num, den] = String(value || '0/1').split('/').map(Number);
      return den ? num / den : num || 0;
    };
    return {
      container: parsed.format?.format_name || '',
      vcodec: video?.codec_name,
      pixfmt: video?.pix_fmt,
      width: Number(video?.width) || 0,
      height: Number(video?.height) || 0,
      fps: rate(video?.avg_frame_rate) || rate(video?.r_frame_rate),
      acodec: audio?.codec_name,
      sampleRate: audio ? Number(audio.sample_rate) || undefined : undefined,
      duration: Number(parsed.format?.duration) || 0,
      size: Number(parsed.format?.size) || 0,
      faststart: await isFastStart(input).catch(() => false),
    };
  }

  /**
   * Still image looped for each narration, the narration half a second in,
   * slides cross-faded, the captions burned in centred and small.
   */
  async assembleSlides({ slides, orientation, subtitles: cues, outputPath }: SlidesAssembly) {
    if (!slides.length) {
      throw new FfmpegError('No slides to assemble', '');
    }
    const { subtitles } = await this.available();
    if (!subtitles) {
      throw new FfmpegError('ffmpeg is installed without libass, so subtitles cannot be burned into the video', '');
    }
    const { w, h } = frameSize(orientation);
    const { starts } = slideSchedule(slides.map((s) => s.durationSeconds));
    const scriptPath = `${outputPath}.ass`;
    await fsp.writeFile(scriptPath, subtitlesScript(cues, orientation));
    const inputs = slides.flatMap((slide) => [
      '-loop',
      '1',
      '-framerate',
      '30',
      '-t',
      slide.durationSeconds.toFixed(3),
      '-i',
      slide.imagePath,
      '-i',
      slide.audioPath,
    ]);
    const graph: string[] = [];
    slides.forEach((slide, i) => {
      const d = slide.durationSeconds.toFixed(3);
      graph.push(
        `[${2 * i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`
      );
      graph.push(
        `[${2 * i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=delays=${Math.round(
          SLIDES_NARRATION_DELAY_SECONDS * 1000
        )}:all=1,apad=whole_dur=${d},atrim=end=${d},asetpts=N/SR/TB[a${i}]`
      );
    });
    let video = '[v0]';
    let audio = '[a0]';
    for (let i = 1; i < slides.length; i++) {
      graph.push(
        `${video}[v${i}]xfade=transition=fade:duration=${SLIDES_FADE_SECONDS}:offset=${starts[i].toFixed(3)}[vx${i}]`
      );
      graph.push(`${audio}[a${i}]acrossfade=d=${SLIDES_FADE_SECONDS}:c1=tri:c2=tri[ax${i}]`);
      video = `[vx${i}]`;
      audio = `[ax${i}]`;
    }
    graph.push(`${video}subtitles=filename='${filterPath(scriptPath)}'[vout]`);
    try {
      await this.run([
        ...this.leading(),
        ...inputs,
        '-filter_complex',
        graph.join(';'),
        '-map',
        '[vout]',
        '-map',
        audio,
        // An output option here, so it caps the encoder: the API keeps
        // answering while a video renders beside it.
        '-threads',
        '2',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        outputPath,
      ]);
    } finally {
      await fsp.rm(scriptPath, { force: true });
    }
  }

  private leading() {
    return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y'];
  }

  private capture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(bin, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new FfmpegError(`${bin} failed: ${error.message}`, String(stderr).slice(-STDERR_TAIL_BYTES)));
          return;
        }
        resolve(String(stdout));
      });
    });
  }

  /**
   * Runs ffmpeg at low priority with the wall-clock cap, keeping the tail of
   * stderr for the error and the log; the caller's message to the user says
   * only that the render failed.
   */
  private run(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = '';
      let timedOut = false;
      let settled = false;
      const child = execFile(ffmpegBin(), args, { maxBuffer: 16 * 1024 * 1024 }, (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error || timedOut) {
          const code = (error as any)?.code;
          const message = timedOut
            ? `ffmpeg timed out after ${ffmpegTimeoutMs()} ms`
            : `ffmpeg exited with ${typeof code === 'number' ? code : 'a signal'}`;
          const tail = stderr.slice(-STDERR_TAIL_BYTES);
          this.logger.error(`${message}\n${tail}`);
          reject(new FfmpegError(message, tail, timedOut, typeof code === 'number' ? code : null));
          return;
        }
        resolve();
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, ffmpegTimeoutMs());
      try {
        if (child.pid) {
          setPriority(child.pid, 10);
        }
      } catch {
        // Not allowed to renice here; run at normal priority.
      }
      child.stderr?.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES * 2);
      });
    });
  }
}
