import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});

export async function getSecret(secretId: string): Promise<Record<string, any> | string> {
    const data = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretId })
    );
        try {
        // Try parsing as JSON (for DB secret or any structured secret)
        return JSON.parse(data.SecretString || '{}');
    } catch {
        // If parsing fails, treat as plain text (for your Google API key)
        return data.SecretString ?? '';
    }
}
