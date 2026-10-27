// A chat belongs to the whole workspace, so what one member typed is shown to
// the others. It is never markup: the bubble renders these parts as React
// elements, text as text, and only the media lines the composer writes
// (`Video: <url>` / `Image: <url>`, inside a `[--Media--]` block) become a
// video or a picture.
export type UserMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; src: string }
  | { type: 'video'; src: string }
  | { type: 'media'; parts: UserMessagePart[] };

// `[id:<media id>]` after the url is for the model (attachments need the id);
// the bubble shows the file.
const MEDIA_LINE =
  /^(Video|Image): (https?:\/\/[^\s[\]"'<>]+)(?: \[id:[^\]]*\])?$/;

const lineParts = (text: string): UserMessagePart[] => {
  const parts: UserMessagePart[] = [];
  let pending = '';
  for (const line of text.split('\n')) {
    const media = line.match(MEDIA_LINE);
    const src = media?.[2];
    if (src && (media[1] === 'Image' || /\.mp4$/i.test(src))) {
      if (pending.trim()) {
        parts.push({ type: 'text', text: pending.trim() });
      }
      pending = '';
      parts.push({ type: media[1] === 'Video' ? 'video' : 'image', src });
      continue;
    }
    pending += (pending ? '\n' : '') + line;
  }
  if (pending.trim()) {
    parts.push({ type: 'text', text: pending.trim() });
  }
  return parts;
};

export const userMessageParts = (text: string): UserMessagePart[] => {
  const parts: UserMessagePart[] = [];
  const cleaned = text.replace(/\[--integrations--\][\s\S]*?\[--integrations--\]/g, '');
  let last = 0;
  for (const block of cleaned.matchAll(/\[--Media--\]([\s\S]*?)\[--Media--\]/g)) {
    parts.push(...lineParts(cleaned.slice(last, block.index)));
    parts.push({ type: 'media', parts: lineParts(block[1]) });
    last = block.index! + block[0].length;
  }
  parts.push(...lineParts(cleaned.slice(last)));
  return parts;
};
