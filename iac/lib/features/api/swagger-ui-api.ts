import { Cors, IRestApi } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

interface SwaggerUIProps {
  api: IRestApi;
}

export class SwaggerUI extends Construct {
  constructor(scope: Construct, id: string, props: SwaggerUIProps) {
    super(scope, id);

    const { api } = props;

    const servers = api.root.addResource("swagger-ui");

    servers.addCorsPreflight({
      allowOrigins: Cors.ALL_ORIGINS,
      allowMethods: ["OPTIONS", "GET"],
    });
    servers.addMethod("GET");
  }
}
