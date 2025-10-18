import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export type Environment = "prod" | "staging";

export interface BaseStackProps extends StackProps {
  /** Name of the service associated with this Stack, e.g. Compute */
  readonly serviceName: string;

  /** Target environment for this stack */
  readonly environment: Environment;
}

export class BaseStack extends Stack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    const { serviceName, environment } = props;

    this.templateOptions.description = `${serviceName} stack for NS2Arena (${environment})`;

    Tags.of(this).add("Application", "NS2Arena");
    Tags.of(this).add("Service", serviceName);
    Tags.of(this).add("Environment", environment);
    Tags.of(this).add("ManagedBy", "CDK");
    Tags.of(this).add("Stack", this.stackName);
    Tags.of(this).add("Region", this.region);
  }
}
