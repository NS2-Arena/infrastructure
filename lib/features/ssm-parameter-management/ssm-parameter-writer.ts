import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { SSMDependencyTracker } from "./ssm-dependency-tracker";
import { Stack } from "aws-cdk-lib";
import { RegionalSSMParameterWriter } from "./regional-ssm-parameter-writer";

interface WriteStringParameterProps {
  parameterName: string;
  stringValue: string;
  region?: string;
}

export class SSMParameterWriter {
  public static writeStringParameter(
    scope: Construct,
    id: string,
    props: WriteStringParameterProps
  ) {
    const { parameterName, stringValue, region } = props;

    const currentRegion = Stack.of(scope).region;
    const targetRegion = region ?? currentRegion;

    SSMDependencyTracker.getInstance().registerProducer(
      Stack.of(scope),
      parameterName,
      targetRegion
    );

    if (currentRegion === targetRegion) {
      new StringParameter(scope, id, props);
    } else {
      new RegionalSSMParameterWriter(
        scope,
        `${parameterName.replaceAll("/", "")}Parameter`,
        {
          parameterName,
          stringValue,
          region: targetRegion,
        }
      );
    }
  }
}
