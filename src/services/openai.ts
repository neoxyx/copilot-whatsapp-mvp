import OpenAI from 'openai';
import dotenv from 'dotenv';
import { db } from '../lib/db';
import { tools, executeToolCall } from './tools';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Eres "Vantio AI", el asistente virtual oficial de Vantio Software (www.vantio-software.com). Tu única función y objetivo es brindar información exclusiva sobre las soluciones, productos de software y servicios de automatización de Vantio Software, guiando a los interesados hacia una demo o asesoría.

--- REGLAS Y RESTRICCIONES ESTRICTAS (BOUNDARIES) ---
1. LÍMITE DE DOMINIO (Scope):
   - Responde ÚNICAMENTE sobre los productos, herramientas y servicios de software/IA ofrecidos por Vantio Software (ej. Copiloto de IA por WhatsApp, agentes virtuales, automatización de procesos, integraciones).
   - Si el usuario pregunta sobre temas ajenos (tecnología general no ofrecida por Vantio, cultura general, consejos externos, programación general, etc.), responde cortésmente: "Como asistente de Vantio Software, solo puedo darte información sobre nuestros productos y servicios de automatización e Inteligencia Artificial. ¿Te gustaría saber cómo podemos ayudar a tu empresa?"

2. INFORMACIÓN Y PRECIOS:
   - Apóyate únicamente en la información oficial del sitio web (www.vantio-software.com).
   - No inventes funcionalidades, integraciones o planes que no existan en nuestro catálogo.
   - Si piden un presupuesto exacto o desarrollo a medida, explica los rangos base si existen o solicita sus datos para que un asesor analice su caso.

3. CAPTURA DE LEADS (Lead Generation):
   - Cuando el usuario exprese interés en una cotización, demo, reunión o comparta datos (nombre, correo, teléfono, empresa o necesidades del negocio), invoca INMEDIATAMENTE la herramienta \`capture_lead\` pasando la información recolectada de forma transparente.

4. IDIOMA Y TONO:
   - Responde siempre en el idioma del usuario (principalmente español e inglés).
   - Mantén un tono profesional, claro, directo, innovador y enfocado en el valor de negocio (ROI, ahorro de tiempo, aumento de ventas).`.trim();
   
export async function generateAIResponse(fromNumber: string, userMessage: string): Promise<string | null> {
    try {
        // 1. Obtener o crear el contacto en la base de datos
        const contact = await db.contact.upsert({
            where: { jid: fromNumber },
            update: {},
            create: { jid: fromNumber },
        });

        // 🛑 FILTRO DE SEGURIDAD: Si está marcado para atención humana, la IA NO responde
        if (contact.isHandledByHuman) {
            console.log(`🛑 [PAUSED] El contacto ${fromNumber} está en atención humana. IA silenciada.`);
            
            // Guardamos el mensaje del usuario en el historial pero NO generamos respuesta de IA
            await db.message.create({
                data: {
                    contactId: contact.id,
                    role: 'user',
                    content: userMessage,
                },
            });

            return null; // Retornar null para que el controlador no envie nada por WhatsApp
        }

        // 2. Guardar el nuevo mensaje del usuario
        await db.message.create({
            data: {
                contactId: contact.id,
                role: 'user',
                content: userMessage,
            },
        });

        // 3. Consultar últimos 10 mensajes
        const recentMessages = await db.message.findMany({
            where: { contactId: contact.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        const formattedHistory = recentMessages.reverse().map((msg) => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
        }));

        let messagesList: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...formattedHistory,
        ];

        console.log(`💾 Contexto cargado desde DB para ${fromNumber} (${formattedHistory.length} mensajes previos).`);

        // 4. Primera solicitud a OpenAI enviando las herramientas disponibles
        let completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messagesList,
            tools: tools,
            tool_choice: 'auto',
            max_tokens: 250,
            temperature: 0.7,
        });

        let responseMessage = completion.choices[0].message;

        // 5. Verificar si OpenAI decidió invocar una Tool
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            console.log(`🛠️ La IA decidió ejecutar ${responseMessage.tool_calls.length} herramientas...`);

            // Agregamos la decisión de la IA a la conversación
            messagesList.push(responseMessage);

            for (const toolCall of responseMessage.tool_calls) {
                // 🔒 Verificación de tipo para narrowing en TypeScript
                if (toolCall.type === 'function') {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments);

                    console.log(`⚙️ Ejecutando función "${toolName}" con argumentos:`, toolArgs);

                    // Ejecutamos la acción en el backend
                    const toolResult = await executeToolCall(toolName, toolArgs, contact.id);

                    // Inyectamos el resultado de la herramienta en el hilo
                    messagesList.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolResult,
                    });
                }
            }

            // Volvemos a consultar a OpenAI con el resultado de la función para la respuesta final al cliente
            completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messagesList,
                max_tokens: 250,
                temperature: 0.7,
            });

            responseMessage = completion.choices[0].message;
        }

        const aiReply = responseMessage.content || 'Gracias por tu información, nos pondremos en contacto pronto.';

        // 6. Guardar la respuesta final de la IA en la BD
        await db.message.create({
            data: {
                contactId: contact.id,
                role: 'assistant',
                content: aiReply,
            },
        });

        return aiReply;

    } catch (error) {
        console.error('❌ Error en el servicio de OpenAI con Function Calling:', error);
        return 'Lo siento, tuve un problema procesando tu solicitud. ¿Podrías indicarme de nuevo tus datos o duda?';
    }
}