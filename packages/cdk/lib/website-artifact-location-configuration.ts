import {Bucket, IBucket} from 'aws-cdk-lib/aws-s3';
import {CfnFunction, Code, S3Code} from 'aws-cdk-lib/aws-lambda';
import {CfnFunction as SamCfnFunction} from 'aws-cdk-lib/aws-sam';
import {CfnParameter, Stack} from 'aws-cdk-lib';
import {Construct} from 'constructs';


export class CodeBuildConstants {
    static readonly CODE_BUILD_BUCKET_PARAM: string = 'CodeBuildBucket';
    static readonly CODE_BUILD_KEY_PARAM: string = 'CodeBuildKey';
}

export interface WebsiteArtifactLocationConfiguration {
    websiteCopyConfiguration(): ArtifactCopyConfiguration
}

export class CodebuildArtifactLocationProvider {
    private readonly stack: Stack;
    private readonly importBucketName = 'CodeBuildBucketImport';
    constructor(readonly parent: Construct) {
        this.stack = Stack.of(parent);
    }

    bucket() {
        const existing = this.stack.node.tryFindChild(this.importBucketName);
        if (existing) {
            return existing as IBucket;
        }
        const param = new CfnParameter(this.parent, CodeBuildConstants.CODE_BUILD_BUCKET_PARAM,
            { type: 'String' });
        return Bucket.fromBucketAttributes(this.stack, this.importBucketName,
            { bucketName: param.valueAsString});
    }

    key() {
        const existing = this.stack.node.tryFindChild(CodeBuildConstants.CODE_BUILD_KEY_PARAM);
        if (existing) {
            return existing as CfnParameter;
        } else {
            return new CfnParameter(this.parent, CodeBuildConstants.CODE_BUILD_KEY_PARAM,
                { type: 'String' });
        }
    }
}

export interface ArtifactCopyConfiguration {
    sourceBucket: IBucket
    sourceKey: string,
    zipSubFolder: string
}
export class CodebuildWebsiteArtifactConfiguration implements WebsiteArtifactLocationConfiguration {
    private readonly codeBuildLocationProvider: CodebuildArtifactLocationProvider;

    constructor(readonly parent: Construct,
                readonly subfolder: string) {
        this.codeBuildLocationProvider = new CodebuildArtifactLocationProvider(parent);
    }

    websiteCopyConfiguration(): ArtifactCopyConfiguration {
        return {
            sourceBucket: this.codeBuildLocationProvider.bucket(),
            sourceKey: this.codeBuildLocationProvider.key().valueAsString,
            zipSubFolder: this.subfolder,
        };
    }

}