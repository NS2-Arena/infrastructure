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
import { DatabaseStack } from "../lib/stacks/database-stack";
import { SSMDependencyTracker } from "../lib/features/ssm-parameter-management/ssm-dependency-tracker";

const app = new App();

const regions = Variables.getTargetRegions(app);
const environment = Variables.getEnvironment();

const mainRegion = process.env.CDK_DEFAULT_REGION!;
const nonMainRegions = regions.filter(
  (regionInfo) => regionInfo.region !== mainRegion
);

// Non main region stacks
nonMainRegions.forEach((regionInfo) => {
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
  );
});

// All region stacks
regions.forEach((region) => {
  new NS2ArenaCompute(app, `Compute${region.name}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: region.region,
    },
    stackName: "Compute",
    serviceName: "Compute",
    environment,
    mainRegion,
  });
});

// Main region only stacks
new SourceConfigBucketStack(app, "SourceConfigBucket", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "SourceConfigBucket",
  environment,
  destinationRegions: nonMainRegions,
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

new DatabaseStack(app, "DatabaseTables", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "DatabaseTables",
  environment,
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

SSMDependencyTracker.getInstance().applyStackDependencies();

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new ServerlessChecks());
Aspects.of(app).add(new NIST80053R5Checks());
