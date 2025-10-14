import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class NS2ArenaControlPlane extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create API
    // Create cognito user pool
    // Create lobby step function workflow
    // Create DynamoDB store
  }
}
