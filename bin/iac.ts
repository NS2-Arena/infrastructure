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
import { ConfigBucketStack } from "../lib/stacks/config-bucket-stack";
import { Variables } from "./variables";
import { DatabaseStack } from "../lib/stacks/database-stack";
import { SSMDependencyTracker } from "../lib/features/ssm-parameter-management/ssm-dependency-tracker";

const app = new App();

const regions = Variables.getTargetRegions(app);
const environment = Variables.getEnvironment();

const mainRegion = Variables.getMainRegion();
const secondaryRegions = regions.filter(
  (regionInfo) => regionInfo.region !== mainRegion
);

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
  });

  new ConfigBucketStack(app, `ConfigBucket${region.name}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: region.region,
    },
    stackName: "ConfigBucket",
    serviceName: "ConfigBucket",
    environment,
    mainRegion,
    destinationRegions: secondaryRegions,
  });
});

// Main region only stacks
new EcrReRepositoryStack(app, "EcrRepository", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ECR",
  environment,
  replicationRegions: secondaryRegions.map((region) => region.region),
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

// Turn off nags for now
// Aspects.of(app).add(new AwsSolutionsChecks());
// Aspects.of(app).add(new ServerlessChecks());
// Aspects.of(app).add(new NIST80053R5Checks());
