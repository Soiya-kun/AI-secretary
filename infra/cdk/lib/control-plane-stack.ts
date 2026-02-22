import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway, aws_cognito as cognito, aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ControlPlaneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true }
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      oAuth: {
        scopes: [cognito.OAuthScope.OPENID]
      }
    });

    const commandTable = new dynamodb.Table(this, 'CommandTable', {
      partitionKey: { name: 'command_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const stateTable = new dynamodb.Table(this, 'StateTable', {
      partitionKey: { name: 'command_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updated_at', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const commandApiHandler = new lambda.Function(this, 'CommandApiHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('dist/src/lambda'),
      handler: 'command-api.handler',
      environment: {
        COMMAND_TABLE_NAME: commandTable.tableName,
        STATE_TABLE_NAME: stateTable.tableName
      }
    });

    commandApiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Scan'],
        resources: [commandTable.tableArn, stateTable.tableArn]
      })
    );

    const api = new apigateway.RestApi(this, 'CommandApi', {
      restApiName: 'ai-secretary-command-api'
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool]
    });

    const v1 = api.root.addResource('v1');
    const commands = v1.addResource('commands');

    const commandLambdaIntegration = new apigateway.LambdaIntegration(commandApiHandler);

    commands.addMethod('POST', commandLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });

    commands.addMethod('GET', commandLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });

    const commandById = commands.addResource('{id}');
    commandById.addMethod('GET', commandLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });

    const cancel = commandById.addResource('cancel');
    cancel.addMethod('POST', commandLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CommandApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'CommandTableName', { value: commandTable.tableName });
  }
}
