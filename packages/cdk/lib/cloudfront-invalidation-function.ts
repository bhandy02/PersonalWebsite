import { Duration, CustomResource, CustomResourceProps } from 'aws-cdk-lib';
import {Construct} from 'constructs';
import { InlineCode, Runtime, SingletonFunction } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import dedent from 'ts-dedent';

export interface CloudFrontInvalidationFunctionProps {
    readonly distributionId: string;
}

export class CloudfrontInvalidationFunction extends Construct {
    constructor(parent: Construct, name: string, props: CloudFrontInvalidationFunctionProps) {
        super(parent, name);
        const lambda = new SingletonFunction(this, 'CloudFrontInvalidationLambda', {
            code: new InlineCode(dedent`
                import logging as log
                import cfnresponse as cf
                import boto3
                import uuid
                import mimetypes
                from botocore.client import Config
                import json
                import zipfile, os, tempfile, sys, time
                import subprocess
                
                
                def main(ev, context):
                    log.getLogger().setLevel(log.INFO)
                    try:
                        log.info(f'Invalidate - input: {ev}')
                
                        logical_id = ev['LogicalResourceId']
                        request_type = ev['RequestType']
                        stack_id = ev['StackId']
                        props = ev['ResourceProperties']
                
                        resp = {}
                        if request_type == "Delete":
                            cf.send(ev, context, cf.SUCCESS, resp, str(uuid.uuid4()))
                            return
                
                        client = boto3.client('cloudfront')
                        do_invalidate(props, client)
                        cf.send(ev, context, cf.SUCCESS, resp, str(uuid.uuid4()))
                    except Exception as e:
                        log.exception(e)
                        cf.send(ev, context, cf.FAILED, {}, str(uuid.uuid4()))
                
                def do_invalidate(props, client):
                    print("Invalidating CloudFront cache")

                    invalidation_paths = props.get('InvalidationPaths', props.get('ObjectPath', '/*')).split(',')
                    distribution_id = props['DistributionId']
                
                    client.create_invalidation(
                        DistributionId=distribution_id,
                        InvalidationBatch={
                            'Paths': {
                                'Quantity': len(invalidation_paths),
                                'Items': invalidation_paths
                            },
                            'CallerReference': str(time.time())
                        }
                    )
            `),
            handler: 'index.main',
            timeout: Duration.seconds(900),
            memorySize: 256,
            runtime: Runtime.PYTHON_3_9,
            initialPolicy: [
                new PolicyStatement({
                    actions: ['cloudfront:CreateInvalidation'],
                    resources: ['*'],
                }),
            ],
            uuid: 'ea8342bb-056e-431a-808d-a043d7d4a069',
            lambdaPurpose: 'InvalidateArtifacts',
        });

        new CustomResource(this, 'CloudfrontInvalidationCustomResource', {
            serviceToken: lambda.functionArn,
            properties: {
                InvalidationPaths: '/index.html',
                DistributionId: props.distributionId,
            },
            resourceType: 'Custom::CloudFrontInvalidationFunction',
        });
    }
}