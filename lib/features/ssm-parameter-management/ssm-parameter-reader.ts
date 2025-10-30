import { StringParameter, StringParameterProps } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { SSMDependencyTracker } from "./ssm-dependency-tracker";
import { Stack } from "aws-cdk-lib";

export class SSMParameterReader {
  public static readStringParameter(
    scope: Construct,
    id: string,
    parameterName: string
  ) {
    SSMDependencyTracker.getInstance().registerConsumer(
      Stack.of(scope),
      parameterName
    );

    return StringParameter.fromStringParameterName(scope, id, parameterName)
      .stringValue;
  }
}
