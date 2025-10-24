#!/usr/bin/env node
import { App, Aspects } from "aws-cdk-lib";
import { RestApiStack } from "../lib/stacks/rest-api-stack";
import {
  AwsSolutionsChecks,
  NIST80053R5Checks,
  ServerlessChecks,
} from "cdk-nag";
import { EcrReRepositoryStack } from "../lib/stacks/ecr-repository-stack";
import { NS2ArenaCompute } from "../lib/stacks/compute-stack";
import { ReplicatedConfigBucketStack } from "../lib/stacks/replicated-config-bucket-stack";
import { SourceConfigBucketStack } from "../lib/stacks/source-config-bucket-stack";
import { Variables } from "./variables";

const app = new App();

const regions = Variables.getTargetRegions(app);
const environment = Variables.getEnvironment();

const nonMainRegions = regions.filter(
  (regionInfo) => regionInfo.region !== process.env.CDK_DEFAULT_REGION
);

const replicatedBucketStacks = nonMainRegions.map(
  (regionInfo) =>
    new ReplicatedConfigBucketStack(
      app,
      `ReplicatedConfigBucket${regionInfo.name}`,
      {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region: regionInfo.region,
        },
        stackName: "ReplicatedConfigBucket",
        serviceName: "ReplicatedConfigBucket",
        environment,
      }
    )
);

const sourceBucketStack = new SourceConfigBucketStack(
  app,
  "SourceConfigBucket",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    serviceName: "SourceConfigBucket",
    environment,
    destinationRegions: nonMainRegions,
  }
);

replicatedBucketStacks.forEach((stack) => {
  sourceBucketStack.addDependency(
    stack,
    "Requires destination buckets to be setup first in order to setup replication"
  );
});

new EcrReRepositoryStack(app, "EcrRepository", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ECR",
  environment,
  replicationRegions: nonMainRegions.map((region) => region.region),
});

regions.forEach((region) => {
  const stack = new NS2ArenaCompute(app, `Compute${region.name}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: region.region,
    },
    stackName: "Compute",
    serviceName: "Compute",
    environment,
  });

  stack.addDependency(sourceBucketStack);
});

new RestApiStack(app, "RestApi", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "RestApi",
  environment,
});

// Create cognito user pool
// Create lobby step function workflow
// Create DynamoDB store

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new ServerlessChecks());
Aspects.of(app).add(new NIST80053R5Checks());
