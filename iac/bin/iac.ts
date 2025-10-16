#!/usr/bin/env node
import { App, Aspects, Tags } from "aws-cdk-lib";
import { NS2ArenaControlPlane } from "../lib/stacks/controlplane-stack";
import {
  AwsSolutionsChecks,
  NIST80053R5Checks,
  ServerlessChecks,
} from "cdk-nag";
import { EcrRegistryStack } from "../lib/stacks/ecr-registry-stack";
import { NS2ArenaCompute } from "../lib/stacks/compute-stack";

interface RegionInfo {
  name: string;
  area: string;
}

const app = new App();

const regions: RegionInfo[] = app.node.tryGetContext(
  "targetRegions"
) as RegionInfo[];

new EcrRegistryStack(app, "EcrStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ECR",
  environment: "staging",
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
    environment: "staging",
  });
});

new NS2ArenaControlPlane(app, "ControlPlane", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  serviceName: "ControlPlane",
  environment: "staging",
});

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new ServerlessChecks());
Aspects.of(app).add(new NIST80053R5Checks());
