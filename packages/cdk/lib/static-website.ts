import {Aws, CfnParameter, Construct, Fn, RemovalPolicy, Stack, Token, StackProps} from 'monocdk';
import {Bucket, BucketEncryption, BlockPublicAccess, } from 'monocdk/aws-s3';
import { PolicyStatement, AccountRootPrincipal } from 'monocdk/aws-iam';
import {HostedZone, AaaaRecord, RecordTarget} from 'monocdk/aws-route53';
import {CloudFrontTarget} from 'monocdk/aws-route53-targets';
import { DnsValidatedCertificate, CertificateValidation, Certificate } from 'monocdk/aws-certificatemanager';
import {CodebuildWebsiteArtifactConfiguration, ArtifactCopyConfiguration} from './website-artifact-location-configuration';
import {ArtifactCopyLambdaFunction} from './artifact-copy-lambda-function';
import {
    BehaviorOptions, CachePolicy,
    CloudFrontAllowedMethods,
    Distribution,
    DistributionProps,
    HttpVersion, IOrigin,
    OriginAccessIdentity,
    SourceConfiguration,
    ViewerProtocolPolicy,
    SecurityPolicyProtocol,
    ViewerCertificate
} from 'monocdk/aws-cloudfront';
import {CloudfrontInvalidationFunction} from './cloudfront-invalidation-function'
import {S3Origin} from 'monocdk/aws-cloudfront-origins';

export interface StaticWebsiteProps {
    websiteArtifactCopyConfiguration: CodebuildWebsiteArtifactConfiguration;
}

export class StaticWebsite extends Construct {
    readonly bucket: Bucket;
    readonly distribution: Distribution;
    constructor(parent: Construct, name: string, props: StaticWebsiteProps) {
        super(parent, name);

        this.bucket = new Bucket(this, 'WebsiteBucket', {
            bucketName: `static-website-${randomId()}`, // Add a random string at the end of the bucketName, since S3 buckets must be globally unique
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            removalPolicy: RemovalPolicy.RETAIN,
        });

        const originAccessIdentity = new OriginAccessIdentity(this, 'OAI', {
            comment: 'OAI for accessing static website assets in S3.'
        });

        const cloudfrontS3AccessPolicy = new PolicyStatement();
        cloudfrontS3AccessPolicy.addActions('s3:GetBucket*', 's3:GetObject*', 's3:List*');
        cloudfrontS3AccessPolicy.addResources(this.bucket.bucketArn, `${this.bucket.bucketArn}/*`);
        cloudfrontS3AccessPolicy.addCanonicalUserPrincipal(originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId);
        this.bucket.addToResourcePolicy(cloudfrontS3AccessPolicy);
        this.bucket.addToResourcePolicy(
            new PolicyStatement({
                actions: ['s3:*'],
                principals: [new AccountRootPrincipal()],
                resources: [this.bucket.arnForObjects('*'), this.bucket.bucketArn],


            }),
        );
        const websiteDomainName:string = Fn.importValue('WebsiteDomainName');
        const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {hostedZoneId: Fn.importValue('HostedZoneId'), zoneName: websiteDomainName});
        const certificate = Certificate.fromCertificateArn(this, 'Certificate', Fn.importValue('CertificateArn'));


        const distribution = new Distribution(this, 'Distribution', {
            
            defaultRootObject: 'index.html',
            certificate: certificate,
            domainNames: [websiteDomainName],
            enabled: true,
            httpVersion: HttpVersion.HTTP2,
            enableLogging: false,
            enableIpv6: true,
            defaultBehavior: {origin: new S3Origin(this.bucket), viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS}
        });


        const recordSet = new AaaaRecord(this, 'RecordSet', {
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
            recordName: 'CloudfrontAliasRecord'
        })
        
        
        
        new CloudfrontInvalidationFunction(this, 'CloudfrontInvalidationFunction', {
            distributionId: distribution.distributionId
        })


        new ArtifactCopyLambdaFunction(this, 'ArtifactCopyLambdaFunction', {
            destBucket: this.bucket,
            sourceBucket: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().sourceBucket,
            sourceKey: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().sourceKey,
            zipSubFolder: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().zipSubFolder
        })
    }

}

function randomId(length = 16) {
    var result           = [];
    const characters       = 'abcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result.push(characters.charAt(Math.floor(Math.random() * 
 charactersLength)));
   }
   return result.join('');
}

