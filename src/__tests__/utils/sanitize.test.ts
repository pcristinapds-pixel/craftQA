import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeId, assertWithinDir } from '../../utils/sanitize.js';

describe('sanitizeId', () => {
  it('should keep alphanumeric characters', () => {
    assert.equal(sanitizeId('test123'), 'test123');
  });

  it('should keep hyphens and underscores', () => {
    assert.equal(sanitizeId('test-case_01'), 'test-case_01');
  });

  it('should replace dots with underscores', () => {
    assert.equal(sanitizeId('test.case'), 'test_case');
  });

  it('should replace path traversal characters', () => {
    assert.equal(sanitizeId('../../../etc/passwd'), '_________etc_passwd');
  });

  it('should replace slashes', () => {
    assert.equal(sanitizeId('path/to/file'), 'path_to_file');
  });

  it('should replace spaces and special characters', () => {
    assert.equal(sanitizeId('test case!@#'), 'test_case___');
  });

  it('should handle empty string', () => {
    assert.equal(sanitizeId(''), '');
  });
});

describe('assertWithinDir', () => {
  it('should not throw for paths within base dir', () => {
    assert.doesNotThrow(() => {
      assertWithinDir('/tmp/test/file.yaml', '/tmp/test');
    });
  });

  it('should throw for path traversal', () => {
    assert.throws(
      () => assertWithinDir('/etc/passwd', '/tmp/test'),
      /Path traversal detected/,
    );
  });

  it('should throw for sibling directory', () => {
    assert.throws(
      () => assertWithinDir('/tmp/other/file.yaml', '/tmp/test'),
      /Path traversal detected/,
    );
  });
});
