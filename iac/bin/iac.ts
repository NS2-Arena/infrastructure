#!/usr/bin/env node
import { App, Aspects } from "aws-cdk-lib";
import { NS2ArenaControlPlane } from "../lib/stacks/controlplane-stack";
import {
  AwsSolutionsChecks,
  NIST80053R5Checks,
  ServerlessChecks,
} from "cdk-nag";
import { EcrRegistryStack } from "../lib/stacks/ecr-registry-stack";
import { NS2ArenaCompute } from "../lib/stacks/compute-stack";
import { Environment } from "../lib/stacks/base-stack";

interface RegionInfo {
  name: string;
  area: string;
}

const app = new App();

const regions: RegionInfo[] = app.node.tryGetContext(
  "targetRegions"
) as RegionInfo[];

const environment: Environment = "staging";

new EcrRegistryStack(app, "EcrStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ECR",
  environment,
  replicationRegions: regions
    .map((region) => region.name)
    .filter((region) => region !== process.env.CDK_DEFAULT_REGION),
});

// TODO: Use StackSets when Compute is stable
regions.forEach((region) => {
  new NS2ArenaCompute(app, `Compute${region.area}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: region.name,
    },
    serviceName: "Compute",
    environment,
  });
});

new NS2ArenaControlPlane(app, "ControlPlane", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ControlPlane",
  environment,
});

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new ServerlessChecks());
Aspects.of(app).add(new NIST80053R5Checks());
