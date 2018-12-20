import {
  GraphQLSchemaProvider,
  SchemaChangeUnsubscribeHandler,
  SchemaResolveConfig
} from "./base";
import {
  ApolloConfig,
  isClientConfig,
  isServiceConfig,
  isLocalServiceConfig
} from "../../config";

import { IntrospectionSchemaProvider } from "./introspection";
import { EngineSchemaProvider } from "./engine";
import { FileSchemaProvider } from "./file";
import { createDecipher } from "crypto";

export {
  GraphQLSchemaProvider,
  SchemaChangeUnsubscribeHandler,
  SchemaResolveConfig
};

export function schemaProviderFromConfig(
  config: ApolloConfig
): GraphQLSchemaProvider {
  if (isServiceConfig(config)) {
    if (config.service.localSchemaFile) {
      return new FileSchemaProvider({ path: config.service.localSchemaFile });
    }

    if (config.service.endpoint) {
      return new IntrospectionSchemaProvider(config.service.endpoint);
    }

    if (config.service.name) {
      return new EngineSchemaProvider(config);
    }
  }

  if (isClientConfig(config)) {
    if (typeof config.client.service === "string") {
      return new EngineSchemaProvider(config);
    }

    if (config.client.service) {
      if (isLocalServiceConfig(config.client.service)) {
        return new FileSchemaProvider({
          path: config.client.service.localSchemaFile
        });
      }

      return new IntrospectionSchemaProvider(config.client.service);
    }
  }

  throw new Error(`
  Unable to fetch a schema, because no schema provider could be created.
This may be because we couldn't find an ENGINE_API_KEY in the environment,
no --key was passed in, no --endpoint was passed in, or a service name wasn't set in the apollo.config.js.
For more information about configuring Apollo projects, see the guide here (https://bit.ly/2ByILPj).
  `);
}
