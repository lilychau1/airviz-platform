"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecret = getSecret;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
async function getSecret(secretId) {
    const data = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
    try {
        // Try parsing as JSON (for DB secret or any structured secret)
        return JSON.parse(data.SecretString || '{}');
    }
    catch {
        // If parsing fails, treat as plain text (for your Google API key)
        return data.SecretString ?? '';
    }
}
