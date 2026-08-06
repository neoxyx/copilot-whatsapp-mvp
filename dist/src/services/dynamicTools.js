"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatToOpenAITools = formatToOpenAITools;
exports.executeDynamicApi = executeDynamicApi;
const client_1 = require("@prisma/client");
/**
 * 1. Transforma las APIs de la BD al formato Tool Call de OpenAI
 */
function formatToOpenAITools(externalApis) {
    return externalApis.map((api) => ({
        type: 'function',
        function: {
            name: api.name,
            description: api.description,
            parameters: (typeof api.parameters === 'string'
                ? JSON.parse(api.parameters)
                : api.parameters),
        },
    }));
}
/**
 * 2. Ejecuta la petición HTTP de la API externa configurada en MySQL
 */
async function executeDynamicApi(apiConfig, args) {
    const { endpointUrl, httpMethod, headers } = apiConfig;
    console.log(`📡 [DYNAMIC API CALL] Invocando ${httpMethod} ${endpointUrl}...`);
    try {
        const requestHeaders = {
            'Content-Type': 'application/json',
            ...(typeof headers === 'object' && headers !== null ? headers : {}),
        };
        let response;
        if (httpMethod === client_1.HttpMethod.GET) {
            const queryParams = new URLSearchParams(args).toString();
            const fullUrl = queryParams ? `${endpointUrl}?${queryParams}` : endpointUrl;
            response = await fetch(fullUrl, { method: 'GET', headers: requestHeaders });
        }
        else {
            response = await fetch(endpointUrl, {
                method: httpMethod,
                headers: requestHeaders,
                body: JSON.stringify(args),
            });
        }
        const data = await response.json();
        return JSON.stringify(data);
    }
    catch (error) {
        console.error(`❌ Error ejecutando API dinámica (${apiConfig.name}):`, error.message);
        return JSON.stringify({ error: 'No se pudo completar la consulta con el servicio externo.' });
    }
}
