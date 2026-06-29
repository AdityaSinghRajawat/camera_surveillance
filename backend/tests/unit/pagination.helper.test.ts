import { describe, expect, it } from 'bun:test';
import { buildPaginationMeta, toLimitOffset } from '../../src/helpers/pagination.helper';

describe('pagination.helper', () => {
  it('converts page/pageSize to limit/offset', () => {
    expect(toLimitOffset(1, 20)).toEqual({ limit: 20, offset: 0 });
    expect(toLimitOffset(3, 20)).toEqual({ limit: 20, offset: 40 });
  });

  it('computes totalPages (ceil) and echoes inputs', () => {
    expect(buildPaginationMeta(1, 20, 41)).toEqual({ page: 1, pageSize: 20, total: 41, totalPages: 3 });
    expect(buildPaginationMeta(2, 10, 0)).toEqual({ page: 2, pageSize: 10, total: 0, totalPages: 0 });
  });
});
