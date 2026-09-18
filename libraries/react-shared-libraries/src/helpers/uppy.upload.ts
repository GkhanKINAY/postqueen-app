import XHRUpload from '@uppy/xhr-upload';
import AwsS3Multipart from '@uppy/aws-s3';
import { BasePlugin, Uppy } from '@uppy/core';
import sha256 from 'sha256';
const fetchUploadApiEndpoint = async (
  fetch: any,
  endpoint: string,
  data: any
) => {
  const res = await fetch(`/media/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  return res.json();
};

/**
 * Mirror customFetch's NOT_SECURED path: when cookies are readable from
 * document.cookie, send them as request headers. Secured (httpOnly) sessions
 * leave these empty and rely on withCredentials instead.
 */
const readNonSecuredAuthHeaders = (): Record<string, string> => {
  if (typeof document === 'undefined') {
    return {};
  }
  const pick = (name: string) =>
    document.cookie
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  const headers: Record<string, string> = {};
  const auth = pick('auth');
  const showorg = pick('showorg');
  const impersonate = pick('impersonate');
  if (auth) headers.auth = auth;
  if (showorg) headers.showorg = showorg;
  if (impersonate) headers.impersonate = impersonate;
  return headers;
};

// Define the factory to return appropriate Uppy configuration
export const getUppyUploadPlugin = (
  provider: string,
  fetch: any,
  backendUrl: string
) => {
  switch (provider) {
    case 'cloudflare':
      return {
        plugin: AwsS3Multipart,
        options: {
          shouldUseMultipart: (file: any) => true,
          endpoint: '',
          createMultipartUpload: async (file: any) => {
            let fileHash = '';
            const contentType = file.type;

            // Skip hash calculation for files larger than 100MB to avoid "Invalid array length" error
            if (file.size <= 100 * 1024 * 1024) {
              try {
                const arrayBuffer = await new Response(file.data).arrayBuffer();
                fileHash = sha256(Buffer.from(arrayBuffer));
              } catch (error) {
                console.warn(
                  'Failed to calculate file hash, proceeding without hash:',
                  error
                );
                fileHash = '';
              }
            }

            return fetchUploadApiEndpoint(fetch, 'create-multipart-upload', {
              file,
              fileHash,
              contentType,
            });
          },
          listParts: (file: any, props: any) =>
            fetchUploadApiEndpoint(fetch, 'list-parts', {
              file,
              ...props,
            }),
          signPart: (file: any, props: any) =>
            fetchUploadApiEndpoint(fetch, 'sign-part', {
              file,
              ...props,
            }),
          abortMultipartUpload: (file: any, props: any) =>
            fetchUploadApiEndpoint(fetch, 'abort-multipart-upload', {
              file,
              ...props,
            }),
          completeMultipartUpload: (file: any, props: any) =>
            fetchUploadApiEndpoint(fetch, 'complete-multipart-upload', {
              file,
              ...props,
            }),
        },
      };
    case 'local':
      return {
        plugin: XHRUpload,
        options: {
          endpoint: `${backendUrl}/media/upload-server`,
          withCredentials: true,
          // Auth middleware accepts header OR cookie. Under NOT_SECURED the
          // session lives in a readable cookie; customFetch sends it as a
          // header, so Uppy must do the same or the XHR arrives anonymous.
          // Function form re-reads at upload time (Uppy is memoized once).
          headers: () => readNonSecuredAuthHeaders(),
        },
      };

    // Add more cases for other cloud providers
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
};

export type WaitForMediaProcessingOptions = {
  id?: string;
  /** The app's authenticated fetch, relative to the backend. */
  fetch: (path: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  /** Shown on the file while the server converts it. */
  processingMessage: string;
  /** Shown when a video could not be converted but is usable as it came. */
  fallbackMessage: string;
  /** The error a file is failed with when it could not be converted at all. */
  failedMessage: string;
  notify?: (message: string) => void;
  /** Between two status reads, in milliseconds. */
  interval?: number;
  /** How long to wait for one file before giving up on the conversion. */
  maxWait?: number;
};

/** The media row an upload response carries: bare on the XHR path, under `saved` on multipart. */
const savedRow = (body: any) => body?.saved ?? body;
const withSavedRow = (body: any, row: any) => (body?.saved ? { ...body, saved: row } : row);

/**
 * Holds an upload open while the server normalizes a video. The upload
 * routes answer a video with `status: "processing"`; this reads
 * `GET /media/:id/status` until the row is `ready` (the new path and poster
 * are written back onto the file's response, so `complete` sees the final
 * row) or `failed`. Never rejects: a rejected post-processor fires Uppy's
 * `error`, on which the uploader drops every file of the batch. A failed
 * mp4 is passed through as it came with a notice; a failed .mov is marked
 * as the file's error so it lands in `result.failed`.
 */
export class WaitForMediaProcessing extends BasePlugin<
  WaitForMediaProcessingOptions,
  any,
  any
> {
  constructor(uppy: Uppy<any, any>, opts: WaitForMediaProcessingOptions) {
    super(uppy, opts);
    this.id = opts.id || 'WaitForMediaProcessing';
    this.type = 'modifier';
  }

  install() {
    this.uppy.addPostProcessor(this.wait);
  }

  uninstall() {
    this.uppy.removePostProcessor(this.wait);
  }

  private wait = async (fileIDs: string[]) => {
    await Promise.all(fileIDs.map((id) => this.waitForFile(id)));
  };

  private async waitForFile(fileID: string) {
    const file = this.uppy.getFile(fileID);
    const row = savedRow(file?.response?.body);
    if (!file || file.error || !row?.id) {
      return;
    }
    // No workflow could be started: the server already said what became of it.
    if (row.status === 'failed') {
      this.settle(fileID, row);
      return;
    }
    if (row.status !== 'processing') {
      return;
    }
    this.uppy.emit('postprocess-progress', file, {
      mode: 'indeterminate',
      message: this.opts.processingMessage,
    });
    const interval = this.opts.interval ?? 2000;
    const deadline = Date.now() + (this.opts.maxWait ?? 25 * 60 * 1000);
    let misses = 0;
    let final: any = null;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      if (!this.uppy.getFile(fileID)) {
        return;
      }
      try {
        const response = await this.opts.fetch(`/media/${row.id}/status`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const latest = await response.json();
        misses = 0;
        if (latest?.status && latest.status !== 'processing') {
          final = latest;
          break;
        }
      } catch {
        // Five reads in a row without an answer: the server is not going to
        // say, so the file is used as it came.
        if (++misses >= 5) {
          break;
        }
      }
    }
    this.settle(fileID, final);
  }

  private settle(fileID: string, final: any) {
    const file = this.uppy.getFile(fileID);
    if (!file) {
      return;
    }
    // The final row is what `complete` must see, whichever way it ended: a
    // failed mp4's path may have moved too.
    if (final?.id) {
      this.uppy.setFileState(fileID, {
        response: { ...file.response, body: withSavedRow(file.response?.body, final) },
      } as any);
    }
    if (final?.status === 'ready') {
      // Nothing else to do.
    } else if (/\.mp4$/i.test(savedRow(this.uppy.getFile(fileID)?.response?.body)?.name || '')) {
      // Usable as it came: the platforms take an mp4, it just was not
      // brought to the rules (or the server never said).
      this.opts.notify?.(this.opts.fallbackMessage);
    } else {
      this.uppy.setFileState(fileID, {
        error: final?.processingError || this.opts.failedMessage,
      } as any);
      this.opts.notify?.(
        `${this.opts.failedMessage}${final?.processingError ? ` (${final.processingError})` : ''}`
      );
    }
    this.uppy.emit('postprocess-complete', this.uppy.getFile(fileID));
  }
}
