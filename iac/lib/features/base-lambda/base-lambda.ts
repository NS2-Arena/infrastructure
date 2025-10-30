import { Duration } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

interface BaseLambdaFunctionProps extends NodejsFunctionProps {
  entry: string;
}

export class BaseLambdaFunction extends NodejsFunction {
  constructor(scope: Construct, id: string, props: BaseLambdaFunctionProps) {
    super(scope, id, {
      architecture: Architecture.ARM_64,
      memorySize: 128,
      reservedConcurrentExecutions: 10,
      timeout: Duration.seconds(15),
      ...props,
    });
  }
}
