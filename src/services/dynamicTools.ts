import { ExternalApi, HttpMethod } from '@prisma/client';

/**
 * 1. Transforma las APIs de la BD al formato Tool Call de OpenAI
 */
export function formatToOpenAITools(externalApis: ExternalApi[]) {
    return externalApis.map((api) => ({
        type: 'function' as const,
        function: {
            name: api.name,
            description: api.description,
            parameters: (typeof api.parameters === 'string'
                ? JSON.parse(api.parameters)
                : api.parameters) as Record<string, any>,
        },
    }));
}

/**
 * 2. Ejecuta la petición HTTP de la API externa configurada en MySQL
 */
export async function executeDynamicApi(apiConfig: ExternalApi, args: Record<string, any>) {
    const { endpointUrl, httpMethod, headers } = apiConfig;
    console.log(`📡 [DYNAMIC API CALL] Invocando ${httpMethod} ${endpointUrl}...`);

    try {
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(typeof headers === 'object' && headers !== null ? (headers as Record<string, string>) : {}),
        };

        let response: Response;
        if (httpMethod === HttpMethod.GET) {
            const queryParams = new URLSearchParams(args).toString();
            const fullUrl = queryParams ? `${endpointUrl}?${queryParams}` : endpointUrl;
            response = await fetch(fullUrl, { method: 'GET', headers: requestHeaders });
        } else {
            response = await fetch(endpointUrl, {
                method: httpMethod,
                headers: requestHeaders,
                body: JSON.stringify(args),
            });
        }

        const data = await response.json();
        return JSON.stringify(data);
    } catch (error: any) {
        console.error(`❌ Error ejecutando API dinámica (${apiConfig.name}):`, error.message);
        return JSON.stringify({ error: 'No se pudo completar la consulta con el servicio externo.' });
    }
}