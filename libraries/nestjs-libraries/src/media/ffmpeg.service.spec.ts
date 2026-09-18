import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  decideAction,
  FfmpegService,
  ffmpegInstalled,
  isFastStart,
  MediaProbe,
  scaleFilter,
  slideSchedule,
  subtitlesScript,
  VIDEO_RULES,
} from './ffmpeg.service';

const box = (type: string, payload = 0) => {
  const buffer = Buffer.alloc(8 + payload);
  buffer.writeUInt32BE(8 + payload, 0);
  buffer.write(type, 4, 'latin1');
  return buffer;
};
const largeBox = (type: string, payload: number) => {
  const buffer = Buffer.alloc(16 + payload);
  buffer.writeUInt32BE(1, 0);
  buffer.write(type, 4, 'latin1');
  buffer.writeBigUInt64BE(BigInt(16 + payload), 8);
  return buffer;
};
const withFile = async (content: Buffer, run: (path: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'pq-ffmpeg-spec-'));
  const path = join(dir, 'a.mp4');
  writeFileSync(path, content);
  try {
    await run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const compliant: MediaProbe = {
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  majorBrand: 'isom',
  vcodec: 'h264',
  pixfmt: 'yuv420p',
  width: 1920,
  height: 1080,
  rotation: 0,
  fps: 30,
  acodec: 'aac',
  duration: 10,
  size: 1000,
  faststart: true,
};

describe('ffmpeg service', () => {
  it('scales down to the rules, never up, on even dimensions', () => {
    assert.equal(
      scaleFilter(),
      "scale=w='trunc(iw*min(1,min(1080/min(iw,ih),1920/max(iw,ih)))/2)*2':h='trunc(ih*min(1,min(1080/min(iw,ih),1920/max(iw,ih)))/2)*2'"
    );
  });

  it('leaves a compliant mp4 alone, remuxes a container problem, transcodes the rest', () => {
    assert.equal(decideAction(compliant, '.mp4'), 'none');
    assert.equal(decideAction({ ...compliant, faststart: false }, '.mp4'), 'remux');
    assert.equal(decideAction({ ...compliant, majorBrand: 'qt  ' }, '.mov'), 'remux');
    assert.equal(decideAction({ ...compliant, vcodec: 'hevc' }, '.mov'), 'transcode');
    assert.equal(decideAction({ ...compliant, width: 3840, height: 2160 }, '.mp4'), 'transcode');
    assert.equal(decideAction({ ...compliant, rotation: 90 }, '.mp4'), 'transcode');
    assert.equal(decideAction({ ...compliant, fps: 120 }, '.mp4'), 'transcode');
    assert.equal(decideAction({ ...compliant, acodec: 'pcm_s16le' }, '.mp4'), 'transcode');
    assert.equal(decideAction({ ...compliant, colorTransfer: 'arib-std-b67' }, '.mp4'), 'transcode');
    assert.equal(decideAction({ ...compliant, pixfmt: 'yuv420p10le' }, '.mp4'), 'transcode');
    // No audio track is as good as aac.
    assert.equal(decideAction({ ...compliant, acodec: undefined }, '.mp4'), 'none');
    assert.equal(VIDEO_RULES.shortSideMax, 1080);
  });

  it('schedules slides so each cross-fade overlaps the end of the slide before', () => {
    const { starts, total } = slideSchedule([4, 5, 6]);
    assert.deepEqual(starts, [0, 3.5, 8]);
    assert.equal(total, 14);
    assert.deepEqual(slideSchedule([7]), { starts: [0], total: 7 });
  });

  it('writes the captions as a centred v4+ style in frame pixels', () => {
    const script = subtitlesScript(
      [{ startSeconds: 0.5, endSeconds: 3.25, text: 'Hello {there}\nworld' }],
      'vertical'
    );
    assert.match(script, /ScriptType: v4\.00\+/);
    assert.match(script, /PlayResX: 1080\nPlayResY: 1920/);
    // Fontname, size, colours, border, then alignment 5 (centre) and margins.
    assert.match(
      script,
      /Style: Default,DejaVu Sans,69,&H00FFFFFF,&H000000FF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,5,65,65,65,1/
    );
    assert.match(script, /Dialogue: 0,0:00:00\.50,0:00:03\.25,Default,,0,0,0,,Hello there\\Nworld/);
    assert.match(subtitlesScript([], 'horizontal'), /PlayResX: 1920\nPlayResY: 1080/);
    assert.match(subtitlesScript([], 'horizontal'), /,39,&H00FFFFFF/);
    // A time that rounds up to the next second never writes a hundredth of 100.
    assert.match(
      subtitlesScript([{ startSeconds: 3.996, endSeconds: 3661.004, text: 'x' }], 'vertical'),
      /Dialogue: 0,0:00:04\.00,1:01:01\.00,/
    );
  });

  it('reads whether the moov atom comes before the media data', async () => {
    await withFile(Buffer.concat([box('ftyp', 4), box('moov', 4), box('mdat', 4)]), async (p) =>
      assert.equal(await isFastStart(p), true)
    );
    await withFile(Buffer.concat([box('ftyp', 4), box('mdat', 4), box('moov', 4)]), async (p) =>
      assert.equal(await isFastStart(p), false)
    );
    // A `free` box is skipped, a 64-bit size is read, a size of 0 runs to the end.
    await withFile(
      Buffer.concat([box('ftyp', 4), box('free', 12), largeBox('moov', 4), box('mdat', 4)]),
      async (p) => assert.equal(await isFastStart(p), true)
    );
    await withFile(Buffer.concat([box('ftyp', 4), Buffer.from([0, 0, 0, 0, 0x6d, 0x64, 0x61, 0x74])]), async (p) =>
      assert.equal(await isFastStart(p), false)
    );
    await withFile(Buffer.from('not a video at all'), async (p) =>
      assert.equal(await isFastStart(p), false)
    );
  });

  it(
    'assembles slides into a 1080p h264 mp4 with fast start and the expected length',
    // ffmpegInstalled() is false on Homebrew's plain ffmpeg (no libass);
    // ffmpeg-full and Debian's pass.
    { skip: !ffmpegInstalled() },
    async () => {
      const service = new FfmpegService();
      const dir = mkdtempSync(join(tmpdir(), 'pq-slides-spec-'));
      const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
      try {
        const slides = ['red', 'green', 'blue'].map((colour, index) => {
          const imagePath = join(dir, `img_${index}.png`);
          const audioPath = join(dir, `aud_${index}.mp3`);
          execFileSync(ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${colour}:s=720x1280`, '-frames:v', '1', imagePath]);
          execFileSync(ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-c:a', 'libmp3lame', audioPath]);
          return { imagePath, audioPath, durationSeconds: 3 };
        });
        const outputPath = join(dir, 'out.mp4');
        await service.assembleSlides({
          slides,
          orientation: 'vertical',
          subtitles: [
            { startSeconds: 0.5, endSeconds: 2.5, text: 'First slide' },
            { startSeconds: 3, endSeconds: 5, text: 'Second slide' },
          ],
          outputPath,
        });
        const probe = await service.probe(outputPath);
        assert.equal(probe.width, 1080);
        assert.equal(probe.height, 1920);
        assert.equal(probe.vcodec, 'h264');
        assert.equal(probe.pixfmt, 'yuv420p');
        assert.equal(probe.acodec, 'aac');
        assert.equal(probe.sampleRate, 48000);
        assert.equal(probe.faststart, true);
        // Three 3 s slides with two 0.5 s cross-fades.
        assert.ok(Math.abs(probe.duration - 8) < 0.25, `duration ${probe.duration}`);
        // The caption script is not left beside the video.
        assert.equal(existsSync(`${outputPath}.ass`), false);
        // What the generator makes needs no normalizing, and a poster is cut at the frame size.
        assert.equal(decideAction(probe, '.mp4'), 'none');
        const posterPath = join(dir, 'poster.jpg');
        await service.poster(outputPath, posterPath, 0.5);
        assert.equal((await service.probe(posterPath)).width, 1080);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
