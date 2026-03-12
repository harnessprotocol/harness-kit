import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

const raw = docs.toFumadocsSource();

// Bridge version gap: fumadocs-mdx 11.x returns files as a function,
// fumadocs-core 15.x expects an array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files = typeof raw.files === 'function' ? (raw.files as any)() : raw.files;

export const source = loader({
  source: { ...raw, files } as typeof raw,
  baseUrl: '/docs',
});
