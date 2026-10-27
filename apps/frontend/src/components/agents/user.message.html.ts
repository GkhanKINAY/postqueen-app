// A chat belongs to the whole workspace, so what one member typed is shown to
// the others: it is text, and only the media markers the composer writes
// (`Video:` / `Image:` lines, the `[--Media--]` block) become elements.
// Escaped first, so a quote in a URL stays inside its attribute and a typed
// tag is shown as typed.
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

export const userMessageHtml = (text: string) =>
  escapeHtml(text)
  // `[id:<media id>]` after the url is for the model (attachments need
  // the id); the bubble shows the file.
  .replace(/Video: (http\S*mp4)(?: \[id:[^\]]*\])?\n/g, (match: string, p1: string) => {
    return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
  })
  .replace(/Image: (http\S*)(?: \[id:[^\]]*\])?\n/g, (match: string, p1: string) => {
    return `<img src="${p1.trim()}" class="h-[150px] w-[150px] max-w-full rounded-[8px]" />`;
  })
  .replace(/\[\-\-Media\-\-\](.*)\[\-\-Media\-\-\]/g, (match: string, p1: string) => {
    return `<div class="flex justify-center mt-[20px]">${p1}</div>`;
  })
  .replace(
    /(\[--integrations--\][\s\S]*?\[--integrations--\])/g,
    (match: string, p1: string) => {
      return ``;
    }
  );
