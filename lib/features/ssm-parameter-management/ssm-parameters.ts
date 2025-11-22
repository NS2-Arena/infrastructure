export class SSMParameters {
  public static ConfigBucket = {
    Arn: "/NS2Arena/ConfigBucket/Arn",
    Name: "/NS2Arena/ConfigBucket/Name",
  };

  public static Tables = {
    Servers: {
      Arn: "/NS2Arena/Tables/Servers/Arn",
      Name: "/NS2Arena/Tables/Servers/Name",
    },
  };

  public static ImageRepositories = {
    NS2Server: {
      Name: "/NS2Arena/ImageRepositories/ns2-server/Name",
    },
  };

  public static StateMachines = {
    ServerManagement: {
      Arn: "/NS2Arena/StateMachines/ServerManagement/Arn",
    },
  };
}
