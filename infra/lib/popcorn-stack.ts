import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as path from "path";

export class PopcornQuestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------- DynamoDB single table ------------------------------------
    const table = new dynamodb.Table(this, "Table", {
      tableName: "PopcornQuest",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      pointInTimeRecovery: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------- API Lambda (with Function URL — no API Gateway) -----------
    const apiBundlePath = path.resolve(__dirname, "..", "..", "apps", "api", "dist");
    const fn = new lambda.Function(this, "ApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(apiBundlePath),
      handler: "lambda.handler",
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    table.grantReadWriteData(fn);

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // ---------- Web bucket -----------------------------------------------
    // Files are uploaded out-of-band by scripts/deploy-web.sh (faster than
    // CDK BucketDeployment which spins up a custom-resource Lambda each time).
    const webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------- CloudFront -----------------------------------------------
    // Strip "/api" prefix before forwarding to the Lambda Function URL.
    const stripApiPrefix = new cloudfront.Function(this, "StripApiPrefix", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  if (req.uri.indexOf('/api/') === 0) {
    req.uri = req.uri.substring(4);
  } else if (req.uri === '/api') {
    req.uri = '/';
  }
  return req;
}
      `),
    });

    // Function URL is "https://<id>.lambda-url.<region>.on.aws/"
    const fnUrlDomain = cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url));
    const apiOrigin = new origins.HttpOrigin(fnUrlDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // Cache policy for HTML / manifest / SW: 1-second TTL so we can still
    // enable brotli/gzip (CloudFront forbids encoding flags when caching is
    // fully disabled). 1s is short enough that deploys land instantly.
    const noCachePolicy = new cloudfront.CachePolicy(this, "NoCachePolicy", {
      cachePolicyName: "popcorn-no-cache",
      defaultTtl: cdk.Duration.seconds(1),
      minTtl: cdk.Duration.seconds(1),
      maxTtl: cdk.Duration.seconds(1),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    // Long-cache policy for hashed assets in /assets/* (vite content-hashes
    // every filename so they're safe to cache forever).
    const longCachePolicy = new cloudfront.CachePolicy(this, "LongCachePolicy", {
      cachePolicyName: "popcorn-immutable",
      defaultTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.days(30),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(webBucket);

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: noCachePolicy,
      },
      additionalBehaviors: {
        // Hashed asset bundles — cache forever
        "/assets/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: longCachePolicy,
        },
        // Photo-mood images — cache for a day (don't change often)
        "/popcorn-moods/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        // API → Lambda Function URL
        "/api/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          functionAssociations: [
            {
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              function: stripApiPrefix,
            },
          ],
        },
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ---------- Outputs --------------------------------------------------
    new cdk.CfnOutput(this, "FunctionUrl", { value: fnUrl.url });
    new cdk.CfnOutput(this, "AppUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "BucketName", { value: webBucket.bucketName });
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}
