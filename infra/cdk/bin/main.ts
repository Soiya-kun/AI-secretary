import * as cdk from 'aws-cdk-lib';
import { ControlPlaneStack } from '../lib/control-plane-stack';

const app = new cdk.App();
new ControlPlaneStack(app, 'AiSecretaryControlPlaneStack');
