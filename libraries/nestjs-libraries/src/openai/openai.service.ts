import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { ImageQuality } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { CreditsService } from '@gitroom/nestjs-libraries/database/prisma/credits/credits.service';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const ClipsPrompt = z.object({
  clips: z.array(
    z.object({
      from: z.number().describe('Number of the first line of the clip'),
      to: z.number().describe('Number of the last line of the clip'),
      title: z.string().describe('Short title of the clip'),
      content: z
        .string()
        .describe('Social media post to publish the clip with, no hashtags'),
    })
  ),
});

/** The three sizes gpt-image renders: square feeds, portrait stories, landscape links. */
export type ImageOrientation = 'square' | 'portrait' | 'landscape';

export interface OpenAiUsage {
  id: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * What a finished OpenAI call used, from its body or from the stream event
 * that carries it: a Responses API `response.completed` (the usage is on
 * `response`), or the last chat completions chunk. Anything else, including
 * the Responses events sent before the end (`usage: null`), is nothing.
 */
export const openAiUsage = (payload: any): OpenAiUsage | null => {
  const body = payload?.response ?? payload;
  const usage = body?.usage;
  if (!usage || typeof body?.id !== 'string') {
    return null;
  }
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return null;
  }
  return { id: body.id, model: body.model, inputTokens, outputTokens };
};

// A streamed chat completion only reports its usage when asked to, as one
// last chunk with no choices. The Responses API always does.
const withStreamUsage = (url: string, init?: RequestInit) => {
  if (!url.endsWith('/chat/completions') || typeof init?.body !== 'string') {
    return init;
  }
  try {
    const body = JSON.parse(init.body);
    if (!body?.stream) {
      return init;
    }
    return {
      ...init,
      body: JSON.stringify({
        ...body,
        stream_options: { ...body.stream_options, include_usage: true },
      }),
    };
  } catch {
    return init;
  }
};

// Passes the stream through untouched and reads its `data:` lines on the
// side, across chunk boundaries.
const usageTap = (report: (usage: OpenAiUsage) => void) => {
  const decoder = new TextDecoder();
  let buffer = '';
  const read = (line: string) => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') {
      return;
    }
    try {
      const usage = openAiUsage(JSON.parse(data));
      if (usage) {
        report(usage);
      }
    } catch {
      /** not JSON, not ours **/
    }
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(read);
    },
    flush() {
      read(buffer + decoder.decode());
    },
  });
};

/**
 * A `fetch` for the OpenAI SDK that hands `report` the usage of every call
 * that completes, streamed or not, and changes nothing the caller reads.
 */
export const meteredFetch =
  (
    report: (usage: OpenAiUsage) => void,
    base: typeof fetch = fetch
  ): typeof fetch =>
  async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const response = await base(input, withStreamUsage(url, init));
    if (!response.ok || !response.body) {
      return response;
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/event-stream')) {
      return new Response(response.body.pipeThrough(usageTap(report)), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    if (type.includes('application/json')) {
      response
        .clone()
        .json()
        .then((payload) => {
          const usage = openAiUsage(payload);
          if (usage) {
            report(usage);
          }
        })
        .catch(() => undefined);
    }
    return response;
  };

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);

  constructor(private _creditsService: CreditsService) {}

  /**
   * An OpenAI client whose every call is charged to the organization by the
   * tokens it used, keyed by the response id so a call is charged once. For a
   * caller that runs the SDK itself: CopilotKit's `/copilot/chat` adapter.
   */
  meteredClient(organizationId: string, action: string) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
      fetch: meteredFetch((usage) => {
        this._creditsService
          .chargeLlm(organizationId, {
            key: `llm:${usage.id}`,
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            action,
          })
          .catch((err) =>
            this.logger.error(
              `Could not charge ${usage.id} to ${organizationId}: ${err}`
            )
          );
      }),
    });
  }

  // The model answers with line numbers and not times, so a clip can only
  // start and end where the transcript really has a boundary
  async pickClips(
    title: string,
    language: string,
    segments: { start: number; end: number; text: string }[],
    maxClips: number
  ) {
    const { clips } = (
      await openai.chat.completions.parse(
        {
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes the transcript of a video and picks the parts that will work best as short vertical clips for social media.
Every line of the transcript is "number [start seconds - end seconds] text".
Pick up to ${maxClips} clips, best first. A clip is a range of consecutive lines that starts with a hook, makes one complete point and is understandable without the rest of the video.
The length of a clip is the end of its last line minus the start of its first line: it must be between 20 and 90 seconds, never longer, so check the numbers before answering.
Clips must not overlap. Write the title and the post in this language, whatever the language of these instructions: ${language}.`,
            },
            {
              role: 'user',
              content: `title: ${title}\n\n${segments
                .map(
                  (p, index) =>
                    `${index} [${p.start.toFixed(1)} - ${p.end.toFixed(1)}] ${
                      p.text
                    }`
                )
                .join('\n')}`,
            },
          ],
          response_format: zodResponseFormat(ClipsPrompt, 'clipsPrompt'),
        },
        // shorter than the activity: an attempt that was given up on must not
        // still be running, and storing clips, when its retry gets there
        { timeout: 8 * 60 * 1000, maxRetries: 0 }
      )
    ).choices[0].message.parsed || { clips: [] };

    return clips;
  }

  async generateImage(
    prompt: string,
    orientation: ImageOrientation = 'square',
    quality?: ImageQuality
  ) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3. Left out,
    // the quality is the model's own choice, which is only right where the
    // image is not charged for (see MediaService.generateImage).
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'chatgpt-image-latest',
        ...(quality ? { quality } : {}),
        size:
          orientation === 'portrait'
            ? '1024x1536'
            : orientation === 'landscape'
            ? '1536x1024'
            : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-4.1',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await openai.chat.completions.parse({
              model: 'gpt-4.1',
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
