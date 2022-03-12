import {Construct, Fn, RemovalPolicy} from 'monocdk';
import {BlockPublicAccess, Bucket, BucketEncryption,} from 'monocdk/aws-s3';
import {AccountRootPrincipal, PolicyStatement} from 'monocdk/aws-iam';
import {AaaaRecord, ARecord, HostedZone, RecordTarget} from 'monocdk/aws-route53';
import {CloudFrontTarget} from 'monocdk/aws-route53-targets';
import {Certificate} from 'monocdk/aws-certificatemanager';
import {CodebuildWebsiteArtifactConfiguration} from './website-artifact-location-configuration';
import {ArtifactCopyLambdaFunction} from './artifact-copy-lambda-function';
import {
    AllowedMethods, CacheCookieBehavior, CachedMethods, CacheHeaderBehavior, CachePolicy, CacheQueryStringBehavior,
    Distribution,
    HttpVersion,
    OriginAccessIdentity,
    PriceClass, SecurityPolicyProtocol,
    SourceConfiguration,
    ViewerProtocolPolicy
} from 'monocdk/aws-cloudfront';
import {CloudfrontInvalidationFunction} from './cloudfront-invalidation-function'
import {S3Origin} from "monocdk/aws-cloudfront-origins";

export interface StaticWebsiteProps {
    websiteArtifactCopyConfiguration: CodebuildWebsiteArtifactConfiguration;
    s3BucketSuffix: string;
}

export class StaticWebsite extends Construct {
    readonly bucket: Bucket;
    readonly distribution: Distribution;
    constructor(parent: Construct, name: string, props: StaticWebsiteProps) {
        super(parent, name);

        this.bucket = new Bucket(this, 'WebsiteBucket', {
            bucketName: `static-website${props.s3BucketSuffix}`,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            removalPolicy: RemovalPolicy.RETAIN,
        });

        const copyFunction = new ArtifactCopyLambdaFunction(this, 'ArtifactCopyLambdaFunction', {
            destBucket: this.bucket,
            sourceBucket: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().sourceBucket,
            sourceKey: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().sourceKey,
            zipSubFolder: props.websiteArtifactCopyConfiguration.websiteCopyConfiguration().zipSubFolder
        })

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

        const distributionCachePolicy = new CachePolicy(this, 'CloudfrontCachePolicy', {
            cachePolicyName: 'PreserveQueryStringsAndHeadersCachePolicy',
            queryStringBehavior: CacheQueryStringBehavior.all(),
            cookieBehavior: CacheCookieBehavior.all(),
            headerBehavior: CacheHeaderBehavior.allowList('Authorization', 'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'Origin'),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
        });
        const distribution = new Distribution(this, 'PersonalWebsiteDistribution', {
            defaultRootObject: 'index.html',
            httpVersion: HttpVersion.HTTP2,
            defaultBehavior: {
                origin: new S3Origin(this.bucket,
                    {originPath: copyFunction.destPath, originAccessIdentity: originAccessIdentity}),
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
                cachePolicy: distributionCachePolicy
            },
            enableIpv6: true,
            enableLogging: false,
            enabled: true,
            priceClass: PriceClass.PRICE_CLASS_100,
            domainNames: [websiteDomainName],
            certificate: certificate,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2018
        });

        // Need two record sets, as the CF distribution has IPv6 enabled.
        new ARecord(this, 'ARecordSet', {
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });


        new AaaaRecord(this, 'AaaaRecordSet', {
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });

        new CloudfrontInvalidationFunction(this, 'CloudfrontInvalidationFunction', {
            distributionId: distribution.distributionId
        })

    }

}
