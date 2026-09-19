/**
 * The clipping processors this build implements, by their CLIPPING_PROCESSOR
 * name. Empty on purpose: upstream runs the jobs on RunPod, and this fork can
 * run them on its own `clipping` task queue with yt-dlp and ffmpeg instead,
 * and the owner has not picked one yet ("Clipping" in docs/upstream-sync.md).
 * While it is empty, clipping is off whatever the environment says.
 */
const clippingProcessors: string[] = [];

/** The configured processor, or undefined when none this build knows is set. */
export const clippingProcessor = () => {
  const name = process.env.CLIPPING_PROCESSOR?.trim();
  return name && clippingProcessors.includes(name) ? name : undefined;
};

/**
 * Whether video clipping can run here. The processor and the transcriber read
 * and write through presigned URLs, which only cloud storage can mint; the
 * clips are picked by OpenAI; Deepgram transcribes a video without usable
 * captions. Read by the backend (routes, MCP tools) and by the frontend (the
 * plan cards list the minutes only when there is something to spend them on).
 */
export const isClippingEnabled = () =>
  !!clippingProcessor() &&
  process.env.STORAGE_PROVIDER === 'cloudflare' &&
  !!process.env.OPENAI_API_KEY &&
  !!process.env.DEEPGRAM_API_KEY;
