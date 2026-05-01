#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PopcornQuestStack } from "../lib/popcorn-stack";

const app = new cdk.App();
new PopcornQuestStack(app, "PopcornQuestStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "Popcorn's Chore Quest — gamified chore tracker",
});
