"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIResponse = generateAIResponse;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../lib/db");
const tools_1 = require("./tools");
dotenv_1.default.config();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const SYSTEM_PROMPT = `Eres "Vantio AI", el copiloto de IA y asistente virtual experto de Vantio Software (www.vantio-software.com). Tu objetivo es atender a los clientes que llegan buscando automatizar su negocio, darles información clara sobre nuestros productos de software y demostrarles cómo nuestras soluciones de IA les ayudan a escalar.

Lineamientos de comportamiento:
1. Idioma: Responde en el idioma del usuario (español e inglés).
2. Tono: Profesional, innovador, directo y empático.
3. Enfoque de Valor: Explicar automatización, incremento de conversión y escalabilidad.
4. Captura de Datos (Lead Generation): Cuando el cliente muestre interés en una demo, asesoría o cotización, o comparta sus datos de contacto (nombre, email, empresa o detalles de su negocio), utiliza la herramienta \`capture_lead\` para guardar sus datos de forma transparente.
5. Restricción: No inventes precios fijos. Para proyectos a medida o cotizaciones exactas, captura los datos para que un asesor los contacte.`.trim();
async function generateAIResponse(fromNumber, userMessage) {
    try {
        // 1. Obtener o crear el contacto en la base de datos
        const contact = await db_1.db.contact.upsert({
            where: { jid: fromNumber },
            update: {},
            create: { jid: fromNumber },
        });
        // 🛑 FILTRO DE SEGURIDAD: Si está marcado para atención humana, la IA NO responde
        if (contact.isHandledByHuman) {
            console.log(`🛑 [PAUSED] El contacto ${fromNumber} está en atención humana. IA silenciada.`);
            // Guardamos el mensaje del usuario en el historial pero NO generamos respuesta de IA
            await db_1.db.message.create({
                data: {
                    contactId: contact.id,
                    role: 'user',
                    content: userMessage,
                },
            });
            return null; // Retornar null para que el controlador no envie nada por WhatsApp
        }
        // 2. Guardar el nuevo mensaje del usuario
        await db_1.db.message.create({
            data: {
                contactId: contact.id,
                role: 'user',
                content: userMessage,
            },
        });
        // 3. Consultar últimos 10 mensajes
        const recentMessages = await db_1.db.message.findMany({
            where: { contactId: contact.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
        const formattedHistory = recentMessages.reverse().map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
        let messagesList = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...formattedHistory,
        ];
        console.log(`💾 Contexto cargado desde DB para ${fromNumber} (${formattedHistory.length} mensajes previos).`);
        // 4. Primera solicitud a OpenAI enviando las herramientas disponibles
        let completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messagesList,
            tools: tools_1.tools,
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
                    const toolResult = await (0, tools_1.executeToolCall)(toolName, toolArgs, contact.id);
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
        await db_1.db.message.create({
            data: {
                contactId: contact.id,
                role: 'assistant',
                content: aiReply,
            },
        });
        return aiReply;
    }
    catch (error) {
        console.error('❌ Error en el servicio de OpenAI con Function Calling:', error);
        return 'Lo siento, tuve un problema procesando tu solicitud. ¿Podrías indicarme de nuevo tus datos o duda?';
    }
}
