import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";

export class NS2ArenaControlPlane extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Create API
    // Create cognito user pool
    // Create lobby step function workflow
    // Create DynamoDB store
  }
}
