import dotenv from 'dotenv';
dotenv.config();

// Variables de entorno necesarias
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'; // Al estar en la máquina local fuera de Docker, le pegamos a localhost:8080
const API_KEY = process.env.EVOLUTION_API_KEY || 'MiLlaveSecretaGlobal123!';
const INSTANCE_NAME = process.env.INNSTACE_NAME || 'agente_ws'; // El nombre que le diste a tu instancia en el Manager

interface SendTextResponse {
    key: {
        id: string;
        remoteJid: string;
        fromMe: boolean;
    };
    message: any;
    messageTimestamp: number;
    status: string;
}

/**
 * Envía un mensaje de texto a un número específico a través de Evolution API
 * @param toNumber Número de teléfono del destinatario (ej: "573000000000@s.whatsapp.net")
 * @param text Texto que se va a enviar
 */
export async function sendWhatsAppMessage(toNumber: string, text: string): Promise<SendTextResponse | null> {
    try {
        const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;

        // 🧹 SANITIZACIÓN AGRESIVA DE TEXTO (Para que WhatsApp no lo rechace)
        const cleanText = text
            // 1. Reemplaza comillas curvadas/raras de OpenAI por comillas simples o dobles normales
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            // 2. Reemplaza guiones largos por guiones normales
            .replace(/[\u2014\u2015]/g, "-")
            // 3. Eliminamos cualquier emoji remanente por si acaso
            .replace(/[\u{1F300}-\u{1F6FF}]/gu, '')
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .trim();

        console.log(`📡 Enviando texto sanitizado a ${toNumber}: "${cleanText}"`);

        const payload = {
            number: toNumber,
            text: cleanText,
            options: {
                delay: 1200,
                presence: "composing",
                linkPreview: false
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error de Evolution API (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as SendTextResponse;
        console.log(`🚀 Solicitud aceptada en Evolution para el JID: ${toNumber}`);
        return data;

    } catch (error) {
        console.error('❌ Error al enviar mensaje por WhatsApp:', error);
        return null;
    }
}