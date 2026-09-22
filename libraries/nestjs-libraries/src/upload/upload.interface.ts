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
  // Presigned URLs, so another service (the clipping processor, the
  // transcriber) reads or writes one key without the bucket's credentials;
  // only cloud storage can mint them
  signDownloadUrl?(fileName: string): Promise<string>;
  signUploadUrl?(fileName: string, contentType: string): Promise<string>;
  // Public URL of a key the clipping processor wrote through a presigned upload
  publicUrl?(fileName: string): string;
  // A small text file (a transcript) under a key both sides know, where
  // uploadSimple would pick a random one. It is read back with readFile
  writeFile?(
    fileName: string,
    body: string,
    contentType: string
  ): Promise<void>;
}
