import { IBucket } from 'monocdk/aws-s3';
import { PolicyStatement, IRole } from 'monocdk/aws-iam';
import { Construct, Duration, CustomResource } from 'monocdk';
import { Function, Code, Runtime } from 'monocdk/aws-lambda';
import dedent from "ts-dedent";

export interface IArtifactCopyLambdaFunctionProps {
    /**
     * The destination bucket to copy to.
     */
    destBucket: IBucket;


    /**
     * The source bucket to copy from.
     */
    sourceBucket: IBucket;

    /**
     * The source key to copy.
     * We would normally expect this to be a folder.
     * We'll recursively copy from the sourceKey to the destination.
     *
     * If the source key is a zip archive, we'll extract it, but you must use the
     * @argument sourceKeyIsZipped to let us know.
     */
    sourceKey: string;

    /**
     *
     *
     * The subfolder from within the extracted archive to copy from.
     *
     * @default none
     */
    zipSubFolder: string;
}

/**
 * A construct to copy things during stack modifies.
 * Uses an inline lambda as a custom resource
 */
export class ArtifactCopyLambdaFunction extends Construct {
    readonly destBucket: IBucket;
    readonly destPath: string;

    constructor(parent: Construct, name: string, props: IArtifactCopyLambdaFunctionProps) {
        super(parent, name);
        const copyLambda = new Function(this, 'CopyCustomResourceLambda', {
            code: Code.fromInline(dedent`
                import logging as l
                import cfnresponse as cf
                import boto3,uuid,mimetypes,json,subprocess,zipfile,os,tempfile,sys
                from botocore.client import Config
                NN=None
                def run(cmd):
                    l.info(f'Run:{cmd}')
                    p=subprocess.Popen(cmd)
                    r=p.wait()
                    if r != 0:
                        raise ValueError("CmdFail")
                    return r

                def is_true(k,p):
                    return p.get(k,'').lower() in ['true']

                SC='SkipCleanup'
                R='ROOT'
                S='SUBFOLDER'
                def main(ev, context):
                    rand = str(uuid.uuid4())
                    l.getLogger().setLevel(l.INFO)
                    try:
                        l.info(f'In: {ev}')
                        rp = ev['ResourceProperties']
                        clean = not is_true(SC,rp) if SC in rp else is_true(CD,rp)
                        dst_bucket = rp['DestBucket']
                        source_bkt = rp.get('SourceBucket', rp.get('TestActualBucket'))
                        source_key = rp.get('SourceKey', rp.get('AdditionalArtifactsFolder'))
                        z_sub = rp.get('Subfolder', '')

                        actual_source=NN
                        actual_full_dest=NN
                        actual_dest_key = ''

                        if ev['RequestType'] == "Delete":
                            cf.send(ev,context,cf.SUCCESS,{},rand)
                            return
                        s3 = boto3.resource('s3',config=Config(signature_version='s3v4'))
                        l.info("Get")
                        t = tempfile.TemporaryDirectory()
                        zp = f'{t.name}/a.zip'
                        s3.Bucket(source_bkt).download_file(source_key, zp)
                        l.info("DLd")
                        ext_t = tempfile.TemporaryDirectory()
                        with zipfile.ZipFile(zp, 'r') as a:
                            if (z_sub in ['/', '.', '']):
                                a.extractall(ext_t.name)
                            else:
                                for f in a.namelist():
                                    if f.startswith(z_sub):
                                        a.extract(f, ext_t.name)
                            actual_source = f'{ext_t.name}/{z_sub}'

                        actual_full_dest = dst_bucket

                        actual_full_dest = f's3://{actual_full_dest}'
                        l.info(f'Copy {actual_source} to {actual_full_dest}')
                        clt = tempfile.TemporaryDirectory()
                        os.environ['HOME'] = clt.name
                        run(['pip3','install','--force-reinstall','--user','-I','awscli'])
                        P="PATH"
                        os.environ[P] = f'{os.environ[P]}:{clt.name}/.local/bin/'
                        os.environ.pop('PYTHONPATH',NN)
                        a = ["aws","s3","sync","--metadata-directive","REPLACE",actual_source,actual_full_dest]
                        run(a)

                        cf.send(ev,context,cf.SUCCESS,{'DestPath':actual_dest_key,'OriginPath':actual_dest_key},rand)
                    except Exception as e:
                        l.exception(e)
                        cf.send(ev,context,cf.FAILED,{},rand)
            `),
            handler: 'index.main',
            timeout: Duration.seconds(900),
            memorySize: 3008,
            runtime: Runtime.PYTHON_3_6,
            description: 'Copies the static resources from one spot to another',
        });
        copyLambda.addToRolePolicy(new PolicyStatement({
            actions: ['s3:Get*', 's3:List*', 's3:Put*', 's3:DeleteObject'],
            resources: [props.destBucket.bucketArn, props.destBucket.arnForObjects('*')],
        }));
        copyLambda.addToRolePolicy(new PolicyStatement({
            actions: ['s3:Get*', 's3:List*'],
            resources: [props.sourceBucket.bucketArn, props.sourceBucket.arnForObjects('*')],
        }))
        copyLambda.addToRolePolicy(new PolicyStatement({
            actions: ['kms:*'],
            resources: ['*'],
        }))

        const copyProps: { [key: string]: any } = {
            DestBucket: props.destBucket.bucketName,
            SourceBucket: props.sourceBucket.bucketName,
            SourceKey: props.sourceKey,
            Subfolder: props.zipSubFolder,
        };

        Object.keys(copyProps).forEach((key) => copyProps[key] == null && delete copyProps[key]);
        const copyCustomResource = new CustomResource(this, 'CopyCustomResource', {
            serviceToken: copyLambda.functionArn,
            properties: copyProps,
            resourceType: 'Custom::StaticCopy',
        });
        this.destBucket = props.destBucket;
        this.destPath = copyCustomResource.getAtt('DestPath').toString();
        }
}