import OpenAI from 'openai';
import { PrismaClient, MessageRole, MessageType } from '@prisma/client';
import dotenv from 'dotenv';
import { formatToOpenAITools, executeDynamicApi } from './dynamicTools';
import { evaluateCondition, executeRuleAction } from './rulesEngine';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export async function generateAIResponse(phone: string, userMessageText: string): Promise<string | null> {
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
                role: MessageRole.user,
                content: userMessageText,
                type: MessageType.TEXT,
            },
        });

        // 🚨 5. EVALUAR REGLAS DE NEGOCIO (PRE-PROCESAMIENTO DE IA)
        for (const rule of agent.businessRules) {
            const isMatch = evaluateCondition(rule.condition, { userMessage: userMessageText });
            if (isMatch) {
                const ruleResult = await executeRuleAction(rule, contact);
                if (ruleResult.triggered && ruleResult.replyMessage) {
                    // Guardar la respuesta de la regla en MySQL
                    await prisma.message.create({
                        data: {
                            contactId: contact.id,
                            role: MessageRole.assistant,
                            content: ruleResult.replyMessage,
                            type: MessageType.TEXT,
                        },
                    });
                    return ruleResult.replyMessage;
                } else if (ruleResult.triggered) {
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

        const formattedHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = pastMessages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
        }));

        // 7. Preparar las Tools dinámicas desde MySQL
        const tools = formatToOpenAITools(agent.externalApis);

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: agent.systemPrompt },
            ...formattedHistory,
        ];

        console.log(`🧠 [IA DINÁMICA] Procesando mensaje para ${phone} con Agente: "${agent.name}"...`);

        const response = await openai.chat.completions.create({
            model: agent.model || 'gpt-4o',
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
                        const apiResultJson = await executeDynamicApi(matchedApi, toolArgs);

                        // Añadir respuesta de la herramienta al contexto y solicitar respuesta final
                        messages.push(responseMessage);
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: apiResultJson,
                        });

                        const secondResponse = await openai.chat.completions.create({
                            model: agent.model || 'gpt-4o',
                            messages: messages,
                        });

                        const finalReply = secondResponse.choices[0].message.content || '';

                        // Guardar la respuesta final de la IA en MySQL
                        await prisma.message.create({
                            data: {
                                contactId: contact.id,
                                role: MessageRole.assistant,
                                content: finalReply,
                                type: MessageType.TEXT,
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
                role: MessageRole.assistant,
                content: finalReply,
                type: MessageType.TEXT,
            },
        });

        return finalReply;
    } catch (error: any) {
        console.error('❌ Error en generateAIResponse (MySQL/Prisma):', error);
        return 'Lo siento, tuve un inconveniente procesando tu solicitud. Intentemos de nuevo.';
    }
}