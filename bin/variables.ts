import { App } from "aws-cdk-lib";

export type Environment = "prod" | "staging";

export interface RegionInfo {
  region: string;
  name: string;
}

export class Variables {
  public static getEnvironment(): Environment {
    return "staging";
  }

  public static getTargetRegions(app: App): RegionInfo[] {
    return app.node.tryGetContext("targetRegions") as RegionInfo[];
  }

  public static getMainRegion(): string {
    return process.env.CDK_DEFAULT_REGION!;
  }
}
