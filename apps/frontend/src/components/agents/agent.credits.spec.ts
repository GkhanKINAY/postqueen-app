import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const credits = read('./agent.credits.tsx');
const page = read('./agent.tsx');
const chat = read('./agent.chat.tsx');
const input = read('./agent.input.tsx');
const composer = read('../new-launch/compose.ai.assistant.tsx');

describe('Copilot credits', () => {
  it('shows the balance only, hidden with billing off or unlimited, linked for whoever may open Billing', () => {
    assert.match(
      credits,
      /if \(!data \|\| data\.unlimited\) \{\s*return null;/
    );
    assert.match(credits, /formatCredits\(data\.balance \?\? 0\)/);
    assert.match(credits, /canOpenBilling \? \(\s*<Link\s+href="\/billing"/);
  });

  it('puts the chip in the Copilot chat bar and the Create Post rail header', () => {
    assert.match(page, /<CopilotCreditsChip className="ms-auto" \/>/);
    assert.match(
      composer,
      /data-pq="composer-ai-head"[\s\S]*?<CopilotCreditsChip \/>\s*<ComposeAiStartOver \/>/
    );
  });

  it('reads the balance again after every finished run, on both surfaces', () => {
    assert.match(
      credits,
      /if \(wasLoading\.current && !isLoading\) \{\s*mutate\('credits-balance'\);/
    );
    assert.match(chat, /const credits = useCopilotCreditsWatch\(isLoading\);/);
    assert.match(
      composer,
      /const credits = useCopilotCreditsWatch\(isLoading\);/
    );
  });

  it('treats a 402 insufficient_credits from the run like an empty balance', () => {
    assert.match(
      credits,
      /error\?\.status === 402 && error\?\.payload\?\.code === 'insufficient_credits'/
    );
    // `onError` on the v1 <CopilotKit> only fires with a Copilot Cloud key.
    assert.match(credits, /setInternalErrorHandler\(\{\s*credits:/);
    assert.match(credits, /removeInternalErrorHandler\('credits'\)/);
    assert.doesNotMatch(chat, /onError=/);
    assert.doesNotMatch(composer, /onError=/);
    assert.match(chat, /<CopilotCreditsContext\.Provider value=\{credits\}>/);
    assert.match(
      composer,
      /<CopilotCreditsContext\.Provider value=\{credits\}>/
    );
    assert.match(credits, /notice: empty \|\| refused/);
  });

  it('says so in the message box and stops sending only while the balance is empty', () => {
    assert.match(input, /<CopilotCreditsNotice \/>/);
    assert.match(composer, /<CopilotCreditsNotice className="mb-\[8px\]" \/>/);
    assert.match(credits, /\(data\.balance \?\? 0\) <= 0/);
    assert.match(
      input,
      /const \{ empty: outOfCredits \} = useCopilotCreditsOut\(\);/
    );
    assert.match(input, /!outOfCredits &&/);
    assert.match(composer, /inProgress \|\| outOfCredits \|\| !next/);
  });
});
