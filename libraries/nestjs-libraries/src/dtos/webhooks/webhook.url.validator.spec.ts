import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBlockedIp } from './webhook.url.validator.ts';

describe('isBlockedIp', () => {
  it('blocks private, loopback and link-local IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.17.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
    ]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
  });

  it('allows public IPv4 and IPv6', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e']) {
      assert.equal(isBlockedIp(ip), false, ip);
    }
  });

  it('blocks loopback, unspecified and IPv4-compatible IPv6', () => {
    for (const ip of ['::1', '::', '0:0:0:0:0:0:0:1', '::7f00:1', '::127.0.0.1', '::a00:1']) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
  });

  it('judges an IPv4-mapped address by the IPv4 it carries, in either spelling', () => {
    // Node's URL parser turns [::ffff:127.0.0.1] into [::ffff:7f00:1]
    assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
    assert.equal(isBlockedIp('::ffff:7f00:1'), true);
    assert.equal(isBlockedIp('::ffff:a9fe:a9fe'), true); // 169.254.169.254
    assert.equal(isBlockedIp('0:0:0:0:0:ffff:ac11:1'), true); // 172.17.0.1
    assert.equal(isBlockedIp('::ffff:808:808'), false); // 8.8.8.8
    assert.equal(isBlockedIp('::ffff:8.8.8.8'), false);
  });

  it('looks inside NAT64, 6to4 and Teredo', () => {
    assert.equal(isBlockedIp('64:ff9b::7f00:1'), true);
    assert.equal(isBlockedIp('64:ff9b::127.0.0.1'), true);
    assert.equal(isBlockedIp('64:ff9b::808:808'), false);
    assert.equal(isBlockedIp('64:ff9b:1::1'), true);
    assert.equal(isBlockedIp('2002:7f00:1::1'), true);
    assert.equal(isBlockedIp('2002:808:808::1'), false);
    assert.equal(isBlockedIp('2001:0:4136:e378:8000:63bf:3fff:fdd2'), true);
  });

  it('covers the whole link-local, site-local, unique-local and multicast ranges', () => {
    for (const ip of ['fe80::1', 'fe9a::1', 'febf::1', 'fec0::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', 'fe80::1%eth0']) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
  });

  it('blocks what is not an IP address', () => {
    assert.equal(isBlockedIp('localhost'), true);
    assert.equal(isBlockedIp(''), true);
  });
});
