import express from 'express';
import dotenv from 'dotenv';
import { sendWhatsAppMessage } from './services/whatsapp';
import { generateAIResponse } from './services/openai';

dotenv.config();

const app = express();

// Middleware para parsear JSON con límite configurado
app.use(express.json({ limit: process.env.BODY_PARSER_LIMIT || '10mb' }));

const PORT = process.env.PORT || 3000;

// 3. Webhook de Evolution API
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        console.log(`📡 Webhook recibido. Evento: "${body?.event}"`);

        // Validamos estrictamente que sea un mensaje entrante
        if (body.event?.toLowerCase() === 'messages.upsert' && body.data) {
            const messageData = body.data;
            const fromMe = messageData.key?.fromMe;
            const fromNumber = messageData.key?.remoteJid;

            // Ignoramos mensajes propios y grupos
            if (!fromMe && messageData.message && fromNumber && !fromNumber.includes('@g.us')) {
                const textReceived = messageData.message.conversation ||
                    messageData.message.extendedTextMessage?.text;

                if (textReceived) {
                    console.log(`📩 [MESSAGES_UPSERT] Texto de [${fromNumber}]: "${textReceived}"`);

                    // 1. RESPUESTA INMEDIATA A EVOLUTION API (Libera el hilo de red)
                    res.status(200).send('EVENT_RECEIVED');

                    // 2. PROCESAMIENTO ASÍNCRONO EN SEGUNDO PLANO
                    setTimeout(async () => {
                        try {
                            console.log(`🧠 Procesando cerebro de IA para ${fromNumber}...`);
                            const aiReply = await generateAIResponse(fromNumber, textReceived);

                            if (aiReply) {
                                console.log(`🤖 IA Generó respuesta. Despachando a WhatsApp...`);
                                await sendWhatsAppMessage(fromNumber, aiReply);
                            } else {
                                console.log(`ℹ️ Mensaje no enviado a ${fromNumber} porque el bot está en modo pausado.`);
                            }
                        } catch (bgError) {
                            console.error('❌ Error en el hilo secundario de IA:', bgError);
                        }
                    }, 50);

                    return;
                }
            }
        }

        // Si es cualquier otro evento (contacts.update, etc.), respondemos rápido y salimos
        return res.status(200).send('OK');

    } catch (error) {
        console.error('🔴 Error crítico en el Webhook:', error);
        return res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Express escuchando en el puerto ${PORT}`);
});