#!/usr/bin/env node
import 'source-map-support/register';
import {App, SecretValue, CfnParameter} from 'monocdk';
import { PersonalWebsiteStack } from '../lib/personal-website-stack';
import {BuildStack} from '../lib/build-stack';
import { Artifact } from 'monocdk/aws-codepipeline';

import {
    GitHubSourceActionProps
} from 'monocdk/aws-codepipeline-actions';
const env = {region: 'us-east-1', account: '552063170091' }
const app = new App();

const artifact = new Artifact('SourceCodeArtifact');
const stageRegionMap: {[key: string]: string[]} = {
    production: ['us-east-1']
};
const githubProps: GitHubSourceActionProps = {
    actionName: 'source-code-push-from-github',
    owner: 'bhandy02',
    output: artifact,
    repo: 'PersonalWebsite',
    branch: 'main',
    oauthToken: SecretValue.secretsManager('github-oauth-token')
}
new BuildStack(app, 'BuildStack', {
    env,
    githubProps,
    stageRegionMap,
    websiteDomainName: 'brianhandy.io'
});
new PersonalWebsiteStack(app, 'PersonalWebsiteStack');

app.synth();
