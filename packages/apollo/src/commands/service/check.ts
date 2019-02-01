import { flags } from "@oclif/command";
import { table } from "heroku-cli-util";
import { introspectionFromSchema } from "graphql";
import { duration } from "moment";

import { gitInfo } from "../../git";
import { ChangeType, format, SchemaChange as Change } from "../../diff";
import { ProjectCommand } from "../../Command";
import { HistoricQueryParameters } from "apollo-language-server/lib/engine/operations/checkSchema";

export default class ServiceCheck extends ProjectCommand {
  static aliases = ["schema:check"];
  static description =
    "Check a service against known operation workloads to find breaking changes";
  static flags = {
    ...ProjectCommand.flags,
    tag: flags.string({
      char: "t",
      description: "The published tag to check this service against"
    }),
    validationPeriod: flags.string({
      description:
        "The size of the time window with which to validate the schema against. You may provide a number (in days), or an ISO8601 format duration for more granularity (see: https://en.wikipedia.org/wiki/ISO_8601#Durations)",
      default: "1"
    }),
    queryCountThreshold: flags.integer({
      description:
        "Minimum number of requests within the requested time window for a query to be considered.",
      default: 1
    }),
    queryCountThresholdPercentage: flags.integer({
      description:
        "Number of requests within the requested time window for a query to be considered, relative to total request count. Expected values are between 0 and 0.05 (minimum 5% of total request volume)",
      default: 0
    })
  };

  async run() {
    const { gitContext, checkSchemaResult }: any = await this.runTasks(
      ({ config, flags, project }) => [
        {
          title: "Checking service for changes",
          task: async ctx => {
            if (!config.name) {
              throw new Error("No service found to link to Engine");
            }

            const tag = flags.tag || config.tag || "current";
            const schema = await project.resolveSchema({ tag });
            ctx.gitContext = await gitInfo();

            const historicParameters = validateHistoricParams({
              validationPeriod: flags.validationPeriod,
              queryCountThreshold: flags.queryCountThreshold,
              queryCountThresholdPercentage: flags.queryCountThresholdPercentage
            });

            ctx.checkSchemaResult = await project.engine.checkSchema({
              id: config.name,
              schema: introspectionFromSchema(schema).__schema,
              tag: flags.tag,
              gitContext: ctx.gitContext,
              frontend: flags.frontend || config.engine.frontend,
              historicParameters
            });
          }
        }
      ]
    );

    const { targetUrl, diffToPrevious } = checkSchemaResult;
    const { changes /*, type, validationConfig */ } = diffToPrevious;
    const failures = changes.filter(
      ({ type }: Change) => type === ChangeType.FAILURE
    );

    if (changes.length === 0) {
      return this.log("\nNo changes present between schemas\n");
    }
    this.log("\n");
    table(changes.map(format), {
      columns: [
        { key: "type", label: "Change" },
        { key: "code", label: "Code" },
        { key: "description", label: "Description" }
      ]
    });
    this.log("\n");
    // exit with failing status if we have failures
    if (failures.length > 0) {
      this.exit();
    }
    return;
  }
}

// Validates flag variables and:
//   1) returns an input object for the checkSchema query (HistoricQueryParameters)
//   2) or throws an error
export function validateHistoricParams({
  validationPeriod,
  queryCountThreshold,
  queryCountThresholdPercentage
}: {
  validationPeriod: string;
  queryCountThreshold: number;
  queryCountThresholdPercentage: number;
}): HistoricQueryParameters {
  // Is provided string a parseable number?
  const isNumber = !Number.isNaN(Number(validationPeriod));

  // If it's a number, they gave us the count in days. Else, let moment parse the "P30D"
  const windowInSeconds = isNumber
    ? duration(Number(validationPeriod), "days").asSeconds()
    : duration(validationPeriod).asSeconds();

  const from = -1 * windowInSeconds;

  if (from >= 0) {
    throw new Error(
      "Please provide a valid duration for the --validationPeriod flag. Valid durations are represented either as a number (in days) or in ISO 8601 (see: https://en.wikipedia.org/wiki/ISO_8601#Durations)."
    );
  }

  if (!Number.isInteger(queryCountThreshold) || queryCountThreshold < 1) {
    throw new Error(
      "Please provide a valid number for the --queryCountThreshold flag. Valid numbers are integers in the range x >= 1."
    );
  }

  if (
    Number.isNaN(Number(queryCountThresholdPercentage)) ||
    queryCountThresholdPercentage < 0 ||
    queryCountThresholdPercentage > 100
  ) {
    throw new Error(
      "Please provide a valid number for the --queryCountThresholdPercentage flag. Valid numbers are in the range 0 <= x <= 100."
    );
  }

  const asPercentage = queryCountThresholdPercentage / 100;

  return {
    to: -0,
    from,
    queryCountThreshold,
    queryCountThresholdPercentage: asPercentage
  };
}
