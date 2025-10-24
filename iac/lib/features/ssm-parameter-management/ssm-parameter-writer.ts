import { StringParameter, StringParameterProps } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { SSMDependencyTracker } from "./ssm-dependency-tracker";
import { Stack } from "aws-cdk-lib";

interface WriteStringParameterProps {
  parameterName: string;
  stringValue: string;
}

export class SSMParameterWriter {
  public static writeStringParameter(
    scope: Construct,
    id: string,
    props: WriteStringParameterProps,
    additionalProps?: Omit<
      StringParameterProps,
      "parameterName" | "stringValue"
    >
  ) {
    SSMDependencyTracker.getInstance().registerProducer(
      Stack.of(scope),
      props.parameterName
    );

    const combinedProps = { ...props, ...additionalProps };

    return new StringParameter(scope, id, combinedProps);
  }
}
