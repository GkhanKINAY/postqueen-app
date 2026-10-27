import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PostContent } from './create.post.dto.ts';

describe('post content length', () => {
  it('refuses content longer than any post before parsing it', () => {
    assert.throws(
      () => plainToInstance(PostContent, { content: 'a'.repeat(1_000_001) }),
      BadRequestException
    );
  });

  it('sanitizes content within the limit', () => {
    const post = plainToInstance(PostContent, {
      content: '<p dir="auto">hi</p><script>x</script>',
    });
    assert.equal(post.content, '<p dir="auto">hi</p>');
  });
});
