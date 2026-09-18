import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  FfmpegService,
  ffmpegInstalled,
  isFastStart,
  slideSchedule,
  subtitlesScript,
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

describe('ffmpeg service', () => {
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
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
