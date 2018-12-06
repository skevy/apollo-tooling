// EngineSchemaProvider (engine schema reg => schema)
import { NotificationHandler } from "vscode-languageserver";

import gql from "graphql-tag";

import { GraphQLSchema, buildClientSchema } from "graphql";

import { ApolloEngineClient } from "../../engine";
import {
  ClientConfig,
  ServiceConfig,
  parseServiceSpecificer,
  isClientConfig,
  isServiceConfig
} from "../../config";
import {
  GraphQLSchemaProvider,
  SchemaChangeUnsubscribeHandler,
  SchemaResolveConfig
} from "./base";

export class EngineSchemaProvider implements GraphQLSchemaProvider {
  private schema?: GraphQLSchema;
  private engineClient?: ApolloEngineClient;

  constructor(private config: ClientConfig | ServiceConfig) {}
  async resolveSchema(override: SchemaResolveConfig) {
    if (this.schema && (!override || !override.force)) return this.schema;
    const { engine, client, service } = this.config;

    if (isClientConfig(this.config)) {
      if (typeof client!.service !== "string") {
        throw new Error(
          `Service name not found for client, found ${client!.service}`
        );
      }
    } else if (isServiceConfig(this.config)) {
      if (typeof service!.name !== "string") {
        throw new Error(
          `Service name not found for service, found ${service!.name}`
        );
      }
    }

    // create engine client
    if (!this.engineClient) {
      if (!engine.apiKey) {
        throw new Error("ENGINE_API_KEY not found");
      }
      this.engineClient = new ApolloEngineClient(
        engine.apiKey,
        engine.endpoint
      );
    }

    // we know that client.service is a string, since it's checked above
    const serviceName = client
      ? (client.service as string)
      : service
      ? service.name
      : null;
    // TODO more clear error
    if (!serviceName) throw new Error(`Unable to find service name for Engine`);

    const [id, tag = "current"] = parseServiceSpecificer(serviceName);
    const { data, errors } = await this.engineClient.execute({
      query: SCHEMA_QUERY,
      variables: {
        id,
        tag: override && override.tag ? override.tag : tag
      }
    });
    if (errors) {
      // XXX better error handling of GraphQL errors
      throw new Error(errors.map(({ message }: Error) => message).join("\n"));
    }

    if (!data || !data.service.schema) {
      throw new Error(
        `Unable to get schema from Apollo Engine for service ${id}`
      );
    }

    this.schema = buildClientSchema(data.service.schema);
    return this.schema;
  }

  onSchemaChange(
    _handler: NotificationHandler<GraphQLSchema>
  ): SchemaChangeUnsubscribeHandler {
    throw new Error("Polling of Engine not implemented yet");
    return () => {};
  }
}

export const SCHEMA_QUERY = gql`
  query GetSchemaByTag($tag: String!) {
    service: me {
      ... on Service {
        schema(tag: $tag) {
          hash
          __schema: introspection {
            queryType {
              name
            }
            mutationType {
              name
            }
            subscriptionType {
              name
            }
            types {
              ...IntrospectionFullType
            }
            directives {
              name
              description
              locations
              args {
                ...IntrospectionInputValue
              }
            }
          }
        }
      }
    }
  }

  fragment IntrospectionFullType on IntrospectionType {
    kind
    name
    description
    fields {
      name
      description
      args {
        ...IntrospectionInputValue
      }
      type {
        ...IntrospectionTypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...IntrospectionInputValue
    }
    interfaces {
      ...IntrospectionTypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      depreactionReason
    }
    possibleTypes {
      ...IntrospectionTypeRef
    }
  }

  fragment IntrospectionInputValue on IntrospectionInputValue {
    name
    description
    type {
      ...IntrospectionTypeRef
    }
    defaultValue
  }

  fragment IntrospectionTypeRef on IntrospectionType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;
