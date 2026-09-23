import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media'>) {}

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number,
    thumbnail?: string
  ) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
        // The column defaulted every row to "image", videos included; the
        // extension is what every reader of a media row goes by anyway.
        ...(/\.(mp4|mov|webm|m4v)$/i.test(fileName || '') ? { type: 'video' } : {}),
        // The column has existed with a default of 0 since before this
        // migration and nothing ever wrote to it, so every row read as "size
        // unknown" and the Media list view's size line was dead code. The
        // uploader has the number; it just was not being passed along.
        ...(fileSize ? { fileSize } : {}),
        ...(thumbnail ? { thumbnail } : {}),
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
      },
    });
  }

  startProcessing(org: string, id: string) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: { status: 'processing', processingError: null },
      select: { id: true, status: true },
    });
  }

  /**
   * The row as the normalizer left it: a new name and path when the file was
   * re-encoded, the poster, the size; or the error, which marks it failed.
   */
  finishProcessing(
    org: string,
    id: string,
    result: {
      name?: string;
      path?: string;
      thumbnail?: string;
      fileSize?: number;
      error?: string;
    }
  ) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: {
        status: result.error ? 'failed' : 'ready',
        processingError: result.error ? result.error.slice(0, 2000) : null,
        ...(result.name ? { name: result.name } : {}),
        ...(result.path ? { path: result.path } : {}),
        ...(result.thumbnail ? { thumbnail: result.thumbnail } : {}),
        ...(result.fileSize ? { fileSize: result.fileSize } : {}),
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  /**
   * No `deletedAt` filter: a .mov that could not be converted is soft-deleted
   * as it fails, and the uploader polling it still has to read the reason.
   */
  getMediaStatus(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: { id, organizationId: org },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  /** The live rows for a post's media, so a stale path on the post can be replaced. */
  getMediaByIds(ids: string[]) {
    return this._media.model.media.findMany({
      where: { id: { in: ids } },
      select: { id: true, path: true, thumbnail: true, alt: true },
    });
  }

  /**
   * Which of `ids` this organization actually owns. Used to reject media ids
   * borrowed from another organization before they are stored on a post —
   * getMediaById() resolves by id alone, and it is called from the publish
   * worker where no organization is in scope.
   */
  findOwnedMediaIds(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        id: { in: ids },
      },
      select: { id: true },
    });
  }

  /**
   * This organization's live media rows at `paths`. Posts made outside the
   * dashboard name their media by path, with an id of the caller's own.
   */
  findOwnedMediaByPaths(org: string, paths: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        path: { in: paths },
        deletedAt: null,
      },
      select: { id: true, path: true },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, search?: string) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
    // A video still being normalized is not offered yet: the uploader that
    // sent it is waiting on its status, and its path may still change.
    const query = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null,
        status: { not: 'processing' },
        ...searchFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        status: { not: 'processing' },
        ...searchFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        // The list view shows a size beside each file. Old rows default to 0,
        // which the UI treats as "not recorded" rather than "0 bytes".
        fileSize: true,
        createdAt: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}
