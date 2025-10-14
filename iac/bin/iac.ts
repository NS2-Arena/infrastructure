#!/usr/bin/env node
import { App, Aspects, Tags } from "aws-cdk-lib";
import { NS2ArenaControlPlane } from "../lib/stacks/controlplane-stack";
import {
  AwsSolutionsChecks,
  NIST80053R5Checks,
  ServerlessChecks,
} from "cdk-nag";
import { NS2ArenaCompute } from "../lib/compute/compute-stack";

interface RegionInfo {
  name: string;
  area: string;
}

const app = new App();

const regions: RegionInfo[] = app.node.tryGetContext("targetRegions");

regions.forEach((region) => {
  const stack = new NS2ArenaCompute(app, `NS2ArenaCompute${region.area}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: region.name,
    },
    description: "Compute stack for NS2 Arena",
    stackName: "NS2Arena-Compute",
  });

  Tags.of(stack).add("application", "NS2Arena-Compute");
});

// The thinking here is that some information from the compute stacks will be needed by the controlplane. i.e. cluster names, image repo name, etc.
const controlPlane = new NS2ArenaControlPlane(app, "NS2ArenaControlPlane", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Control Plane infrastructure for NS2 Arena",
  stackName: "NS2Arena-ControlPlane",
});

Tags.of(controlPlane).add("application", "NS2Arena-ControlPlane");

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new ServerlessChecks());
Aspects.of(app).add(new NIST80053R5Checks());
