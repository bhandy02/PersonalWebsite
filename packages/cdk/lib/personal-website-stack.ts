import {App, Stack, StackProps} from 'aws-cdk-lib';
import {StaticWebsite} from './static-website';
import {CodebuildWebsiteArtifactConfiguration} from './website-artifact-location-configuration';

export class PersonalWebsiteStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
        super(scope, id);

        new StaticWebsite(this, 'StaticWebsite', {websiteArtifactCopyConfiguration: new CodebuildWebsiteArtifactConfiguration(this, 'personal-website/build/'), s3BucketSuffix: '-brian-handy-personal-website'});
    }
}