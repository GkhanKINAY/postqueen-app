import { Readable } from 'stream';

export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  /**
   * The stored file as a stream, by the URL that was saved on its media row.
   * What the normalizer reads an upload back through: it runs on a worker
   * that may have no disk in common with the API, and the bucket is private.
   */
  readFile(path: string): Promise<Readable>;
  /** Deletes by the same saved URL; a file that is already gone is not an error. */
  removeFile(path: string): Promise<void>;
}
