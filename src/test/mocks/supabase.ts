/**
 * Shared Supabase mock factory.
 *
 * Usage in a test file:
 *   vi.mock('../../lib/supabase', () => ({ supabase: createSupabaseMock() }));
 *
 * Then in individual tests override specific calls:
 *   mockFrom.mockImplementation(...)
 */
import { vi } from 'vitest';

export type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

/** Build a chainable query builder where every method returns itself. */
export function createQueryBuilder(overrides: Partial<MockQueryBuilder> = {}): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    not: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };

  // Every method returns the builder itself for chaining, unless overridden
  for (const key of Object.keys(builder) as (keyof MockQueryBuilder)[]) {
    if (key !== 'maybeSingle') {
      (builder[key] as ReturnType<typeof vi.fn>).mockReturnValue(builder);
    }
  }

  return builder;
}

export function createSupabaseMock() {
  const qb = createQueryBuilder();

  return {
    from: vi.fn(() => qb),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'mock/path.jpg' }, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://mock.storage/path.jpg' } })),
      })),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}
