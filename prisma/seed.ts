import { PrismaClient, HttpMethod } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando poblamiento de la base de datos MySQL...');

    // 1. Limpiar datos de prueba previos (opcional para desarrollo)
    await prisma.businessRule.deleteMany();
    await prisma.externalApi.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.message.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.agent.deleteMany();

    // 2. Crear el Agente Principal de Vantio Software
    const vantioAgent = await prisma.agent.create({
        data: {
            name: 'Copiloto Comercial Vantio',
            description: 'Agente de ventas y atención al cliente en tiempo real para Vantio Software.',
            isActive: true,
            model: 'gpt-4o',
            temperature: 0.7,
            voiceProvider: 'elevenlabs',
            voiceId: 'colombian_natural_v1',
            systemPrompt: `Eres el asistente comercial inteligente de Vantio Software.
- Hablas en español con un tono colombiano cálido, profesional y natural.
- Tu objetivo es presentar las soluciones de software y copilotos de IA de Vantio Software.
- Respuestas breves, directas y orientadas a valor (1 a 3 frases por respuesta).
- Si el cliente pregunta por disponibilidad de agenda para una demo o reunión de presentación, usa la herramienta 'consultar_disponibilidad_demo'.
- Si el cliente muestra interés claro en contratar o solicitar cotización, captura sus datos para el equipo comercial.
- Si el cliente solicita explícitamente hablar con un humano o asesor real, activa la transferencia a un agente.`,
        },
    });

    console.log(`✅ Agente creado con ID: ${vantioAgent.id}`);

    // 3. Crear una Tool / API Externa Dinámica para el Agente
    const demoApi = await prisma.externalApi.create({
        data: {
            agentId: vantioAgent.id,
            name: 'consultar_disponibilidad_demo',
            description: 'Consulta los horarios disponibles en el calendario de Vantio para agendar una demostración en vivo.',
            endpointUrl: 'https://api.vantiosoftware.com/v1/demos/availability', // URL ficticia o tu webhook real
            httpMethod: HttpMethod.POST,
            headers: {
                Authorization: 'Bearer TOKEN_SECRET_VANTIO_2026',
                'Content-Type': 'application/json',
            },
            // JSON Schema de los parámetros que OpenAI le exigirá al usuario
            parameters: {
                type: 'object',
                properties: {
                    fechaDeseada: {
                        type: 'string',
                        description: 'Fecha deseada para la reunión en formato YYYY-MM-DD (ej: 2026-08-10)',
                    },
                    tipoProducto: {
                        type: 'string',
                        description: 'Producto o solución de interés (ej: Copiloto WhatsApp, CRM, Desarrollo a medida)',
                    },
                },
                required: ['fechaDeseada'],
            },
            isActive: true,
        },
    });

    console.log(`✅ API Dinámica creada: ${demoApi.name}`);

    // 4. Crear Reglas de Negocio (Decision Engine)
    const ruleTransfer = await prisma.businessRule.create({
        data: {
            agentId: vantioAgent.id,
            name: 'Transferencia por insatisfacción o solicitud directa',
            priority: 1,
            condition: "user_message.contains('humano') || user_message.contains('asesor') || intent == 'request_human'",
            actionType: 'TRANSFER_HUMAN',
            actionConfig: {
                notifyQueue: 'sales_support_colombia',
                message: 'Un momento por favor, te estoy transfiriendo con uno de nuestros asesores de Vantio.',
            },
            isActive: true,
        },
    });

    console.log(`✅ Regla de negocio creada: ${ruleTransfer.name}`);

    console.log('🚀 Poblamiento de MySQL completado exitosamente.');
}

main()
    .catch((e) => {
        console.error('❌ Error ejecutando el seed:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });