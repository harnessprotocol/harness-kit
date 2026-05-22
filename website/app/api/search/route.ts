import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// Build-time static search index — works with `output: 'export'`, no backend.
export const revalidate = false;
export const dynamic = 'force-static';
export const { staticGET: GET } = createFromSource(source);
