import { ApiType, shopifyApiProject } from '@shopify/api-codegen-preset';
import { ApiVersion } from '@shopify/shopify-api';

import type { IGraphQLConfig } from 'graphql-config';

const config: IGraphQLConfig = {
  projects: {
    default: shopifyApiProject({
      apiType: ApiType.Admin,
      apiVersion: ApiVersion.July25,
      documents: ['./scripts/**/*.{js,ts}'],
      outputDir: './types',
    }),
  },
};

export default config;
