'use client';

import { useEffect, useRef } from 'react';
import type Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';

/**
 * The upload progress strip.
 *
 * `@uppy/react` 5 dropped its `<Dashboard>` wrapper — the package now exports
 * hooks and headless pieces (Dropzone, FilesList, UploadButton) and nothing
 * that renders a dashboard. The plugin itself is unchanged, so this mounts it
 * the vanilla way and keeps the options, the sizing and therefore the look
 * exactly as they were.
 *
 * Every caller uses it purely as a progress bar: upload, retry, pause/resume
 * and cancel buttons are all hidden, and so are the thumbnails. That is why
 * this takes so few props — anything else would be describing a dashboard
 * nobody asked for.
 */
export const UppyProgress = (props: {
  uppy: Uppy<any, any>;
  id: string;
  height: number;
}) => {
  const { uppy, id, height } = props;
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target.current) return;

    uppy.use(Dashboard, {
      id,
      target: target.current,
      inline: true,
      height,
      // Dashboard 5 inverted this option; `hideProgressDetails` defaults to
      // false, so the details the old `showProgressDetails: true` asked for are
      // simply the default now.
      hideUploadButton: true,
      hideRetryButton: true,
      hidePauseResumeButton: true,
      hideCancelButton: true,
      hideProgressAfterFinish: true,
      // Progress-only strip — the library grid renders real media paths, not
      // Uppy thumbs. Leaving ThumbnailGenerator on races with removeFile on
      // complete and logs "file was removed before a thumbnail could be
      // generated, but not removed from the queue".
      disableThumbnailGenerator: true,
    });

    return () => {
      // The plugin has to come off on unmount, or a remount finds its id taken
      // and Uppy refuses to install the second one.
      const installed = uppy.getPlugin(id);
      if (installed) uppy.removePlugin(installed);
    };
  }, [uppy, id, height]);

  return <div ref={target} />;
};
