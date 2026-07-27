"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
exports.executeToolCall = executeToolCall;
const db_1 = require("../lib/db");
// 1. Definición de la Tool para OpenAI
exports.tools = [
    {
        type: 'function',
        function: {
            name: 'capture_lead',
            description: 'Registra y guarda la información de un cliente interesado en una demo, cotización o reunión con Vantio Software.',
            parameters: {
                type: 'object',
                properties: {
                    fullName: {
                        type: 'string',
                        description: 'Nombre completo o de contacto del cliente.',
                    },
                    email: {
                        type: 'string',
                        description: 'Correo electrónico de contacto.',
                    },
                    companyName: {
                        type: 'string',
                        description: 'Nombre de la empresa, negocio o proyecto del cliente.',
                    },
                    notes: {
                        type: 'string',
                        description: 'Resumen breve de la necesidad del cliente (ej. busca automatizar reservas, soporte de ecommerce, etc.).',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'request_human_agent',
            description: 'Transfiere la conversación a un asesor humano cuando el cliente lo pida explícitamente o cuando sus dudas sobrepasen las capacidades de la IA.',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Motivo por el cual se solicita la transferencia a un asesor humano.',
                    },
                },
                required: ['reason'],
            },
        },
    },
];
// 2. Ejecutor de la función real en el Backend
async function executeToolCall(toolName, args, contactId) {
    if (toolName === 'capture_lead') {
        try {
            const lead = await db_1.db.lead.create({
                data: {
                    contactId: contactId,
                    fullName: args.fullName || null,
                    email: args.email || null,
                    companyName: args.companyName || null,
                    notes: args.notes || null,
                },
            });
            console.log(`🎯 [TOOL EXECUTED] Lead capturado con éxito ID: ${lead.id} (${args.fullName || 'Sin nombre'})`);
            return JSON.stringify({
                status: 'success',
                message: 'Información del prospecto guardada exitosamente en el sistema.',
                leadId: lead.id,
            });
        }
        catch (error) {
            console.error('❌ Error al ejecutar tool capture_lead:', error);
            return JSON.stringify({ status: 'error', message: 'No se pudo guardar la información del lead.' });
        }
    }
    if (toolName === 'request_human_agent') {
        try {
            // Actualizamos la marca en la base de datos usando el id del contacto
            await db_1.db.contact.update({
                where: { id: contactId },
                data: { isHandledByHuman: true },
            });
            console.log(`👤 [HUMAN INTERVENTION] Transferido a humano por motivo: "${args.reason}"`);
            return JSON.stringify({
                status: 'success',
                message: 'Conversación marcada para atención humana. Notifica al cliente que un asesor tomará el control en breve.',
            });
        }
        catch (error) {
            console.error('❌ Error en request_human_agent:', error);
            return JSON.stringify({ status: 'error', message: 'No se pudo pausar la IA.' });
        }
    }
    return JSON.stringify({ status: 'error', message: 'Herramienta no encontrada.' });
}
