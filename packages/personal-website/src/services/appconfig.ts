import {
    AppConfigData,
    StartConfigurationSessionCommandInput,
    GetLatestConfigurationCommandInput,
    StartConfigurationSessionCommandOutput,
    GetLatestConfigurationCommandOutput
} from '@aws-sdk/client-appconfigdata';
import NodeCache from 'node-cache';
import { Buffer } from 'buffer';


export class AppConfigRetriever {
    configurationCache: NodeCache;
    sessionTokenCache: NodeCache;
    appConfigClient : AppConfigData;
    constructor() {
        this.configurationCache = new NodeCache({stdTTL: 30});
        this.sessionTokenCache = new NodeCache({stdTTL: 3600});
        this.appConfigClient = new AppConfigData({region: 'us-east-1'});
    }

    async refreshConfig(application: string, environment: string, configuration: string) {
        const featureFlagKey: string = `${application}:${environment}:${configuration}`;
        let sessionToken: string | undefined = this.sessionTokenCache.get(featureFlagKey);
        if (sessionToken === undefined) {
            const startConfigurationSessionInput: StartConfigurationSessionCommandInput = {
                ApplicationIdentifier: application,
                EnvironmentIdentifier: environment,
                ConfigurationProfileIdentifier: configuration
            };


            const startConfigurationSessionResponse: StartConfigurationSessionCommandOutput = await this.appConfigClient.startConfigurationSession(startConfigurationSessionInput);
            sessionToken = startConfigurationSessionResponse.InitialConfigurationToken;
        }
        const getLatestConfigurationInput: GetLatestConfigurationCommandInput = {
            ConfigurationToken: sessionToken
        }
        const getLatestConfigurationSessionResponse: GetLatestConfigurationCommandOutput = await this.appConfigClient.getLatestConfiguration(getLatestConfigurationInput);
        this.sessionTokenCache.set(featureFlagKey, getLatestConfigurationSessionResponse.NextPollConfigurationToken);
        return getLatestConfigurationSessionResponse.Configuration;
    }

    async getFeatureFlagConfig(application: string, environment: string, configuration: string): Promise<any> {
        const featureFlagKey: string = `${application}:${environment}:${configuration}`;
        let featureFlag: Uint8Array | undefined = this.configurationCache.get(featureFlagKey);

        if (featureFlag === undefined) {
            featureFlag = await this.refreshConfig(application, environment, configuration);
            this.configurationCache.set(featureFlagKey, featureFlag);
        }
        return JSON.parse(Buffer.from(featureFlag!).toString('utf8'))
    }

    async getFeature(application: string, environment: string, configuration: string, flagName: string): Promise<boolean> {
        const featureFlagConfig: any = await this.getFeatureFlagConfig(application, environment, configuration);
        return featureFlagConfig[`${flagName}`]['enabled'];
    }





    // Simpler approach if you want to use it
    // Does not use any sort of caching, so the code is quicker and cleaner, but obviously less optimal for not caching any results
    async getFeatureFlagConfigWithoutCaching(application: string, environment: string, configuration: string): Promise<any> {
        const startConfigurationSessionInput: StartConfigurationSessionCommandInput = {
            ApplicationIdentifier: application,
            EnvironmentIdentifier: environment,
            ConfigurationProfileIdentifier: configuration
        };
        const startConfigurationSessionResponse: StartConfigurationSessionCommandOutput = await this.appConfigClient.startConfigurationSession(startConfigurationSessionInput);
        const sessionToken = startConfigurationSessionResponse.InitialConfigurationToken;
        const getLatestConfigurationInput: GetLatestConfigurationCommandInput = {
            ConfigurationToken: sessionToken
        }
        const getLatestConfigurationSessionResponse: GetLatestConfigurationCommandOutput = await this.appConfigClient.getLatestConfiguration(getLatestConfigurationInput);
        return JSON.parse(Buffer.from(getLatestConfigurationSessionResponse.Configuration!).toString('utf8'))
    }
}