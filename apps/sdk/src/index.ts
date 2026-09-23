import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import fetch, { FormData } from 'node-fetch';

function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

/**
 * The body `post()` sends, as the API accepts it. `CreatePostDto` is the
 * server's class, and it declares fields the API fills in itself (a post's
 * `group`, each part's `id` and `delay`) or does not need (`settings` on a
 * network without required settings), so typing the argument as the class
 * made the smallest valid body fail to compile. `shortLink`, `tags` and each
 * part's `image` are filled in below when left out.
 */
export type PostPartInput = {
  content: string;
  image?: Array<{ id?: string; path: string }>;
  id?: string;
  delay?: number;
};

export type PostInput = {
  integration: { id: string };
  value: PostPartInput[];
  settings?: Record<string, unknown>;
  group?: string;
};

export type CreatePostInput = Omit<
  CreatePostDto,
  'type' | 'shortLink' | 'tags' | 'posts'
> & {
  type: 'draft' | 'schedule' | 'now' | 'update';
  shortLink?: boolean;
  tags?: CreatePostDto['tags'];
  posts: PostInput[];
};

// Content types by extension. A video was sent as image/jpeg before.
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export default class PostQueen {
  constructor(
    private _apiKey: string,
    // Override for self-hosted installs: new PostQueen(key, 'https://your-host/api')
    private _path = process.env.POSTQUEEN_API_URL || 'https://api.postqueen.ai'
  ) {}

  async post(posts: CreatePostInput) {
    return (
      await fetch(`${this._path}/public/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        // The API requires `shortLink`, `tags` and an `image` array on every
        // part; fill them in when the caller leaves them out.
        body: JSON.stringify({
          shortLink: false,
          tags: [],
          ...posts,
          posts: posts.posts.map((post) => ({
            ...post,
            value: post.value.map(
              (part): PostPartInput => ({ image: [], ...part })
            ),
          })),
        }),
      })
    ).json();
  }

  async postList(filters: GetPostsDto) {
    return (
      await fetch(`${this._path}/public/v1/posts?${toQueryString(filters)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async upload(file: Buffer, extension: string) {
    const formData = new FormData();
    const ext = extension.replace(/^\./, '').toLowerCase();
    const type = CONTENT_TYPES[ext] || 'image/jpeg';

    // A Buffer is not a BlobPart to the current DOM types; its bytes are.
    const blob = new Blob([new Uint8Array(file)], { type });
    formData.append('file', blob, `upload.${ext}`);

    return (
      await fetch(`${this._path}/public/v1/upload`, {
        method: 'POST',
        // @ts-ignore
        body: formData,
        headers: {
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async integrations() {
    return (
      await fetch(`${this._path}/public/v1/integrations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  deletePost(id: string) {
    return fetch(`${this._path}/public/v1/posts/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._apiKey,
      },
    });
  }
}
