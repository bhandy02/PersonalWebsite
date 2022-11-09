import { App, Aws, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { CertificateValidation, DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ComputeType, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import {
    CodeBuildAction,
    CodeCommitSourceAction,
    CloudFormationCreateReplaceChangeSetAction,
    CloudFormationExecuteChangeSetAction,
    GitHubSourceActionProps,
    CodeCommitSourceActionProps,
    GitHubSourceAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { AccountPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { HostedZone } from 'aws-cdk-lib/aws-route53';

export interface CodeCommitProps {
    readonly codeCommitSourceActionProps: CodeCommitSourceActionProps;
    readonly repositoryName: string;
    readonly repositoryDescription?: string;
}


export interface BuildStackProps extends StackProps {
    readonly stageRegionMap: {[key: string]: string[]};
    readonly githubProps?: GitHubSourceActionProps;
    readonly codeCommitProps?: CodeCommitProps;
    readonly websiteDomainName: string;
    readonly projectName: string;
}

export class BuildStack extends Stack {

    public readonly artifactBucketEncryptionKey? : IKey
    readonly githubSourceActionProps?: GitHubSourceActionProps;
    readonly codeCommitProps?: CodeCommitProps;
    readonly websiteDomainName: string;

    constructor(parent: App, name: string, props: BuildStackProps) {
        super(parent, name, props);
        this.githubSourceActionProps = props.githubProps;
        this.codeCommitProps = props.codeCommitProps;
        this.websiteDomainName = props.websiteDomainName;
        
        const hostedZone = new HostedZone(this, 'HostedZone', {
            zoneName: this.websiteDomainName
        });

        const certificate = new DnsValidatedCertificate(this, 'Certificate', {
            domainName: this.websiteDomainName,
            hostedZone: hostedZone,
            validation: CertificateValidation.fromDns(hostedZone),
            region: 'us-east-1'
        });

        const pipeline = new Pipeline(this, 'Pipeline', {
            pipelineName: props.projectName
        });

        pipeline.artifactBucket.addToResourcePolicy( new PolicyStatement({
            actions: [ 's3:Get*', 's3:List*'],
            resources: [ pipeline.artifactBucket.arnForObjects('*'), pipeline.artifactBucket.bucketArn],
            principals: [ new AccountPrincipal(Aws.ACCOUNT_ID) ]
        }))
        this.artifactBucketEncryptionKey = pipeline.artifactBucket.encryptionKey;
        if (this.artifactBucketEncryptionKey) {
            // Other stacks may need access to the artifact bucket. This will grant any IAM
            // role in the account access to the key so they can access the bucket.
            // Roles will still need policy statements on them to access the key.
            this.artifactBucketEncryptionKey.grant(new AccountPrincipal(Aws.ACCOUNT_ID), 'kms:*');
        }

        pipeline.addToRolePolicy(new PolicyStatement({ actions: ["iam:PassRole"], resources: ["*"] }));

        // Allow the pipeline to execute CFN changes
        pipeline.addToRolePolicy(new PolicyStatement({
            actions: [
                "cloudFormation:Describe*",
                "cloudFormation:Get*",
                "cloudFormation:List*",
                "cloudFormation:Validate*",
                "cloudformation:CreateChangeSet",
                "cloudformation:ExecuteChangeSet",
                "cloudformation:DeleteChangeSet"],
            resources: ["*"]
        }));

        const sourceStage = pipeline.addStage({ stageName: "Source" });
        let sourceOutput: Artifact;
        if (this.githubSourceActionProps) {
            sourceOutput = this.githubSourceActionProps.output;
            sourceStage.addAction(new GitHubSourceAction(this.githubSourceActionProps));
        } else if (this.codeCommitProps) {
            sourceOutput = this.codeCommitProps.codeCommitSourceActionProps.output;
            const repo = new Repository(this, 'CodeRepo', { repositoryName: this.codeCommitProps.repositoryName, description: this.codeCommitProps.repositoryDescription});
            sourceStage.addAction(new CodeCommitSourceAction(this.codeCommitProps.codeCommitSourceActionProps));
        } else {
            throw new Error("One of githubProps or codeCommitProps must be supplied in order to create build stack!");
        }
        const buildStage = pipeline.addStage({ stageName: 'build' });
        const project = new PipelineProject(this, 'CodeBuildProject', {
            environment: {
                buildImage: LinuxBuildImage.STANDARD_3_0,
                computeType: ComputeType.SMALL
            }
        });

        const buildOutput = new Artifact("BuildOutput");

        buildStage.addAction(new CodeBuildAction({
            actionName: 'build',
            project,
            input: sourceOutput,
            outputs: [buildOutput]
        }));

        const stackNameBase = props.projectName;

        Object.keys(props.stageRegionMap).forEach(stage => {
            const stageSpecificStage = pipeline.addStage({ stageName: `Update-${stage}` });
            props.stageRegionMap[stage].forEach(region => {
                const changeSetName = `ChangeSetUpdate-${stage}-${region}`;
                stageSpecificStage.addAction(new CloudFormationCreateReplaceChangeSetAction({
                    actionName: `CreateChangeSet-${stage}-${region}`,
                    region,
                    stackName: `${stackNameBase}-${stage}`,
                    changeSetName,
                    adminPermissions: true,
                    runOrder: 1,
                    templatePath: buildOutput.atPath('cdk/build/PersonalWebsiteStack.template.json'),
                    templateConfiguration: buildOutput.atPath('cdk/build/templateConfig.json'),
                }));
                stageSpecificStage.addAction(new CloudFormationExecuteChangeSetAction({
                    actionName: `ExecuteChangeSet-${stage}-${region}`,
                    region,
                    stackName: `${stackNameBase}-${stage}`,
                    runOrder: 2,
                    changeSetName,
                }));
            });
        });
        
        new CfnOutput(this, 'WebsiteDomainName', {value: this.websiteDomainName, exportName: 'WebsiteDomainName'})
        new CfnOutput(this, 'HostedZoneId', { value: hostedZone.hostedZoneId, exportName: 'HostedZoneId'})
        new CfnOutput(this, 'CertificateArn', {value: certificate.certificateArn, exportName: 'CertificateArn'})
    }
}