import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the environment variables
const originalEnv = import.meta.env;

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('creates Supabase client with correct configuration', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    });
    
    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeDefined();
    expect(client?.auth).toBeDefined();
    expect(client?.from).toBeDefined();
  });

  it('returns null when environment variables are missing', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined,
    });

    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeNull();
  });

  it('returns null when only URL is provided', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: undefined,
    });

    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeNull();
  });

  it('returns null when only anon key is provided', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    });

    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeNull();
  });

  it('handles empty string environment variables', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    });

    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeNull();
  });

  it('creates client with valid environment variables', async () => {
    vi.stubGlobal('import.meta.env', {
      ...originalEnv,
      VITE_SUPABASE_URL: 'https://valid-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'valid-anon-key-12345',
    });

    const { supabase: client } = await import('./supabaseClient');
    
    expect(client).toBeDefined();
    expect(typeof client?.auth).toBe('object');
    expect(typeof client?.from).toBe('function');
  });
});
