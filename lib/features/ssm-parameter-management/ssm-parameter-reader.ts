import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { SSMDependencyTracker } from "./ssm-dependency-tracker";
import { Stack } from "aws-cdk-lib";
import { RegionalSSMParameterReader } from "./regional-ssm-parameter-reader";
import { Variables } from "../../../bin/variables";

export class SSMParameterReader {
  public static readStringParameter(
    scope: Construct,
    id: string,
    props: { parameterName: string; region?: string }
  ): string {
    const { parameterName, region } = props;

    const currentRegion = Stack.of(scope).region;
    const targetRegion = region ?? currentRegion;

    SSMDependencyTracker.getInstance().registerConsumer(
      Stack.of(scope),
      parameterName,
      targetRegion
    );

    if (currentRegion === targetRegion)
      return StringParameter.fromStringParameterName(scope, id, parameterName)
        .stringValue;
    else
      return new RegionalSSMParameterReader(
        scope,
        `${parameterName.replaceAll("/", "")}Parameter`,
        {
          parameterName,
          region: targetRegion,
        }
      ).getParameterValue();
  }
}
