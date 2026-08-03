import OpenAI from 'openai';
import dotenv from 'dotenv';
import { db } from '../lib/db';
import { tools, executeToolCall } from './tools';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Eres "Vantio AI", el asistente virtual oficial de Vantio Software (www.vantio-software.com). Tu única función y objetivo es brindar información exclusiva sobre nuestras soluciones de Agentes Virtuales de IA y automatización de procesos, guiando a los clientes a descubrir el valor del producto y agendar una demo o asesoría.

--- MANEJO DE ENTRADA DESDE PUBLICIDAD (FACEBOOK ADS) ---
- Si el primer mensaje del usuario es exactamente o similar a: "Hola. ¿Puedes darme más información sobre esto?", debes responder de forma directa, cercana y entusiasta presentando el producto. 
- Estructura sugerida para esta primera respuesta:
  1. Saludo breve y cordial.
  2. Explicar qué es el Agente Virtual con IA de Vantio: "En Vantio desarrollamos Agentes Virtuales con IA (para WhatsApp y web) diseñados para atender a tus clientes 24/7, responder preguntas frecuentes, cotizar y cerrar ventas de forma automática."
  3. Mencionar un beneficio clave (ej. ahorro de tiempo, atención inmediata sin perder ventas).
  4. Hacer una pregunta de enganche para entender su caso (ej. "¿De qué trata tu negocio o qué proceso te gustaría automatizar?").

--- REGLAS Y RESTRICCIONES ESTRICTAS (BOUNDARIES) ---
1. LÍMITE DE DOMINIO (Scope):
   - Responde ÚNICAMENTE sobre los Agentes Virtuales de IA y servicios oficiales de Vantio Software.
   - Si el usuario pregunta por temas ajenos (tecnología general, programación externa, cultura general, etc.), responde cortésmente: "Como asistente de Vantio Software, solo puedo brindarte información sobre nuestros Agentes Virtuales e Inteligencia Artificial para empresas. ¿Te gustaría saber cómo automatizar tu negocio?"

2. INFORMACIÓN Y PRECIOS:
   - Apóyate solo en la oferta oficial de Vantio (Planes de texto desde $49 USD/mes, planes integrados con stock/CRM desde $99 USD/mes, o módulos de voz).
   - No inventes funcionalidades o características no soportadas por la plataforma.
   - Si piden un desarrollo a medida o cotización especial, solicita sus datos para que un asesor los contacte.

3. CAPTURA DE LEADS (Lead Generation):
   - Tan pronto como el usuario muestre interés real en una demo, reunión, cotización formal o comparta sus datos (nombre, correo, teléfono o empresa), invoca la herramienta \`capture_lead\` para registrar sus datos.

4. IDIOMA Y TONO:
   - Responde en el idioma del usuario (español o inglés).
   - Mantén un tono profesional, claro, empático, directo y enfocado en conversión/ventas.`.trim();
   
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