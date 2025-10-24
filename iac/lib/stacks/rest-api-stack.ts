import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { SwaggerUI } from "../features/api/swagger-ui-api";
import { RestApi } from "aws-cdk-lib/aws-apigateway";

export class RestApiStack extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // const api = new RestApi(this, "RestApi");

    // if (props.environment === "staging")
    //   new SwaggerUI(this, "SwaggerUI", { api });
  }
}
