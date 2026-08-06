"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIResponse = generateAIResponse;
const openai_1 = __importDefault(require("openai"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const dynamicTools_1 = require("./dynamicTools");
const rulesEngine_1 = require("./rulesEngine");
dotenv_1.default.config();
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new client_1.PrismaClient();
async function generateAIResponse(phone, userMessageText) {
    try {
        // 1. Obtener el agente activo (o el primero por defecto)
        const agent = await prisma.agent.findFirst({
            where: { isActive: true },
            include: {
                externalApis: { where: { isActive: true } },
                businessRules: { where: { isActive: true }, orderBy: { priority: 'asc' } },
            },
        });
        if (!agent) {
            console.error('❌ No se encontró ningún Agente activo en MySQL.');
            return 'En este momento nuestro sistema se encuentra en mantenimiento.';
        }
        // 2. Buscar o crear el Contacto asignado a este Agente
        let contact = await prisma.contact.findUnique({
            where: {
                agentId_phone: {
                    agentId: agent.id,
                    phone: phone,
                },
            },
        });
        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    agentId: agent.id,
                    phone: phone,
                },
            });
        }
        // 3. Verificar si la atención humana está activa (Handover)
        if (contact.isHandledByHuman) {
            console.log(`ℹ️ [HANDOVER ACTIVO] La conversación de ${phone} está asignada a un asesor humano.`);
            return null;
        }
        // 4. Guardar el mensaje entrante del usuario en MySQL
        await prisma.message.create({
            data: {
                contactId: contact.id,
                role: client_1.MessageRole.user,
                content: userMessageText,
                type: client_1.MessageType.TEXT,
            },
        });
        // 🚨 5. EVALUAR REGLAS DE NEGOCIO (PRE-PROCESAMIENTO DE IA)
        for (const rule of agent.businessRules) {
            const isMatch = (0, rulesEngine_1.evaluateCondition)(rule.condition, { userMessage: userMessageText });
            if (isMatch) {
                const ruleResult = await (0, rulesEngine_1.executeRuleAction)(rule, contact);
                if (ruleResult.triggered && ruleResult.replyMessage) {
                    // Guardar la respuesta de la regla en MySQL
                    await prisma.message.create({
                        data: {
                            contactId: contact.id,
                            role: client_1.MessageRole.assistant,
                            content: ruleResult.replyMessage,
                            type: client_1.MessageType.TEXT,
                        },
                    });
                    return ruleResult.replyMessage;
                }
                else if (ruleResult.triggered) {
                    return null; // Silencio
                }
            }
        }
        // 6. Cargar historial reciente de la base de datos (últimos 10 mensajes)
        const pastMessages = await prisma.message.findMany({
            where: { contactId: contact.id },
            orderBy: { createdAt: 'asc' },
            take: 10,
        });
        const formattedHistory = pastMessages.map((m) => ({
            role: m.role,
            content: m.content,
        }));
        const recentHistory = formattedHistory.slice(-8);
        // 7. Preparar las Tools dinámicas desde MySQL
        const tools = (0, dynamicTools_1.formatToOpenAITools)(agent.externalApis);
        const messages = [
            { role: 'system', content: agent.systemPrompt },
            ...recentHistory,
            { role: 'user', content: userMessageText },
        ];
        console.log(`🧠 [IA DINÁMICA] Procesando mensaje para ${phone} con Agente: "${agent.name}"...`);
        const response = await openai.chat.completions.create({
            model: agent.model || 'gpt-4o-mini',
            temperature: agent.temperature,
            messages: messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
        });
        const responseMessage = response.choices[0].message;
        // 9. Manejo de Tool Calls (APIs Dinámicas)
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            for (const toolCall of responseMessage.tool_calls) {
                // 🛡️ Guard de TypeScript: Asegurar que sea de tipo 'function'
                if (toolCall.type === 'function' && 'function' in toolCall) {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                    const matchedApi = agent.externalApis.find((api) => api.name === toolName);
                    if (matchedApi) {
                        console.log(`🛠️ [TOOL EXECUTION] Invocando "${toolName}" para ${phone}...`);
                        const apiResultJson = await (0, dynamicTools_1.executeDynamicApi)(matchedApi, toolArgs);
                        // Añadir respuesta de la herramienta al contexto y solicitar respuesta final
                        messages.push(responseMessage);
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: apiResultJson,
                        });
                        const secondResponse = await openai.chat.completions.create({
                            model: agent.model || 'gpt-4o-mini',
                            messages: messages,
                        });
                        const finalReply = secondResponse.choices[0].message.content || '';
                        // Guardar la respuesta final de la IA en MySQL
                        await prisma.message.create({
                            data: {
                                contactId: contact.id,
                                role: client_1.MessageRole.assistant,
                                content: finalReply,
                                type: client_1.MessageType.TEXT,
                            },
                        });
                        return finalReply;
                    }
                }
            }
        }
        // 10. Respuesta estándar de texto
        const finalReply = responseMessage.content || '';
        // Guardar respuesta de la IA en MySQL
        await prisma.message.create({
            data: {
                contactId: contact.id,
                role: client_1.MessageRole.assistant,
                content: finalReply,
                type: client_1.MessageType.TEXT,
            },
        });
        return finalReply;
    }
    catch (error) {
        console.error('❌ Error en generateAIResponse (MySQL/Prisma):', error);
        return 'Lo siento, tuve un inconveniente procesando tu solicitud. Intentemos de nuevo.';
    }
}
