import { Arn, Stack } from "aws-cdk-lib";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  AwsSdkCall,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { NagPackSuppression, NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

interface SSMParameterReaderProps {
  parameterName: string;
  stringValue: string;
  region: string;
}

function removeLeadingSlash(value: string): string {
  return value.slice(0, 1) == "/" ? value.slice(1) : value;
}

export class RegionalSSMParameterWriter extends AwsCustomResource {
  constructor(scope: Construct, id: string, props: SSMParameterReaderProps) {
    const { parameterName, stringValue, region } = props;

    const ssmAwsSdkCall: AwsSdkCall = {
      service: "SSM",
      action: "putParameter",
      parameters: {
        Name: parameterName,
        Value: stringValue,
        Type: "String",
      },
      region,
      physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
    };

    const ssmCrPolicy = AwsCustomResourcePolicy.fromSdkCalls({
      resources: [
        Arn.format(
          {
            service: "ssm",
            region: props.region,
            resource: "parameter",
            resourceName: removeLeadingSlash(parameterName),
          },
          Stack.of(scope)
        ),
      ],
    });

    super(scope, id, { onUpdate: ssmAwsSdkCall, policy: ssmCrPolicy });

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "NIST.800.53.R5-IAMNoInlinePolicy",
          reason: "Using inline policy",
        },
      ],
      true
    );
    this.addSuppressions();
  }

  private addSuppressions(): void {
    const reason = "Custom resource singleton lambda";
    const stack = Stack.of(this);
    // The UUID is a fixed value used by CDK for custom resources
    const customResourceId = `AWS${AwsCustomResource.PROVIDER_FUNCTION_UUID.split(
      "-"
    ).join("")}`;
    const stackLogicalId = stack.node.id;

    const suppressions: {
      path: string;
      nagSupressions: NagPackSuppression[];
    }[] = [
      {
        path: `/${stackLogicalId}/${customResourceId}/ServiceRole/Resource`,
        nagSupressions: [
          {
            id: "AwsSolutions-IAM4",
            appliesTo: [
              "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
            ],
            reason,
          },
        ],
      },
      {
        path: `/${stackLogicalId}/${customResourceId}/Resource`,
        nagSupressions: [
          { id: "Serverless-LambdaDefaultMemorySize", reason },
          { id: "Serverless-LambdaDLQ", reason },
          { id: "Serverless-LambdaTracing", reason },
          { id: "NIST.800.53.R5-LambdaConcurrency", reason },
          { id: "NIST.800.53.R5-LambdaDLQ", reason },
          { id: "NIST.800.53.R5-LambdaInsideVPC", reason },
        ],
      },
      {
        path: `/${stackLogicalId}/${customResourceId}/LogGroup/Resource`,
        nagSupressions: [
          { id: "NIST.800.53.R5-CloudWatchLogGroupEncrypted", reason },
        ],
      },
    ];

    // Get all existing paths in the stack
    const allExistingPaths = new Set(
      stack.node.findAll().map((node) => `/${node.node.path}`)
    );

    // Apply suppressions only to paths that exist
    suppressions.forEach((supression) => {
      if (allExistingPaths.has(supression.path)) {
        NagSuppressions.addResourceSuppressionsByPath(
          stack,
          supression.path,
          supression.nagSupressions,
          true
        );
      }
    });
  }
}
