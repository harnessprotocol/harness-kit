import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

// To enable sidebar icons defined in meta.json, install lucide-react and add:
//
//   import { icons } from 'lucide-react';
//   import { createElement } from 'react';
//
// Then add to the loader() call:
//
//   icon: (icon) => {
//     if (icon && icon in icons) {
//       return createElement(icons[icon as keyof typeof icons]);
//     }
//   },
//
// lucide-react is a peer dep of fumadocs-ui — run: npm install lucide-react

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/docs',
});
