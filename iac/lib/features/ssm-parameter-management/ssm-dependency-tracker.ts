import { Stack } from "aws-cdk-lib";

interface SSMParameterDependencyGraph {
  [name: string]: {
    [parameterRegion: string]: {
      consumers: Stack[];
      producer?: Stack;
    };
  };
}

export class SSMDependencyTracker {
  private static instance: SSMDependencyTracker;
  private dependencyGraph: SSMParameterDependencyGraph;

  constructor() {
    this.dependencyGraph = {};
  }

  public static getInstance(): SSMDependencyTracker {
    if (!SSMDependencyTracker.instance) {
      SSMDependencyTracker.instance = new SSMDependencyTracker();
    }

    return SSMDependencyTracker.instance;
  }

  public registerProducer(
    stack: Stack,
    ssmParameterName: string,
    ssmParameterRegion?: string
  ): void {
    const stackRegion = stack.region;
    const ssmRegion = ssmParameterRegion ?? stackRegion;

    if (!(ssmParameterName in this.dependencyGraph)) {
      this.dependencyGraph[ssmParameterName] = {
        [ssmRegion]: {
          consumers: [],
          producer: stack,
        },
      };

      return;
    }

    if (!(ssmRegion in this.dependencyGraph[ssmParameterName])) {
      this.dependencyGraph[ssmParameterName][ssmRegion] = {
        consumers: [],
        producer: stack,
      };

      return;
    }

    if (
      this.dependencyGraph[ssmParameterName][ssmRegion].producer !== undefined
    ) {
      throw new Error(
        `Multiple producers for SSM Parameter detected: ${ssmParameterName}, ${ssmRegion}`
      );
    }

    this.dependencyGraph[ssmParameterName][ssmRegion].producer = stack;
  }

  public registerConsumer(
    stack: Stack,
    ssmParameterName: string,
    ssmParameterRegion?: string
  ): void {
    const stackRegion = stack.region;
    const ssmRegion = ssmParameterRegion ?? stackRegion;

    if (!(ssmParameterName in this.dependencyGraph)) {
      this.dependencyGraph[ssmParameterName] = {
        [ssmRegion]: {
          consumers: [stack],
        },
      };

      return;
    }

    if (!(ssmRegion in this.dependencyGraph[ssmParameterName])) {
      this.dependencyGraph[ssmParameterName][ssmRegion] = {
        consumers: [stack],
      };

      return;
    }

    this.dependencyGraph[ssmParameterName][ssmRegion].consumers.push(stack);
  }

  public applyStackDependencies(): void {
    Object.entries(this.dependencyGraph).forEach(
      ([ssmParameterName, dependency]) => {
        Object.entries(dependency).forEach(
          ([region, { consumers, producer }]) => {
            if (producer === undefined)
              throw new Error(
                `SSM Dependency without producer: ${ssmParameterName}, ${region}`
              );

            consumers.forEach((consumer) => {
              consumer.addDependency(producer);
            });
          }
        );
      }
    );
  }
}
