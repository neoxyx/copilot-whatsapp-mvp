import { BusinessRule, ActionType, Contact, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface RuleEvaluationResult {
    triggered: boolean;
    ruleName?: string;
    actionType?: ActionType;
    replyMessage?: string;
}

/**
 * Evaluador liviano de condiciones escritas en MySQL
 */
export function evaluateCondition(conditionStr: string, context: { userMessage: string; intent?: string }): boolean {
    const text = context.userMessage.toLowerCase();
    const intent = context.intent?.toLowerCase() || '';

    // Soporte para condiciones simples escritas en la BD
    if (conditionStr.includes("user_message.contains")) {
        // Extrae las palabras clave dentro de los paréntesis o comillas
        const matches = conditionStr.match(/'([^']+)'|"([^"]+)"/g);
        if (matches) {
            return matches.some((m) => text.includes(m.replace(/['"]/g, '').toLowerCase()));
        }
    }

    if (conditionStr.includes("intent ==")) {
        const matches = conditionStr.match(/'([^']+)'|"([^"]+)"/g);
        if (matches) {
            return matches.some((m) => intent === m.replace(/['"]/g, '').toLowerCase());
        }
    }

    return false;
}

/**
 * Ejecuta la acción configurada en la Regla de Negocio
 */
export async function executeRuleAction(
    rule: BusinessRule,
    contact: Contact
): Promise<RuleEvaluationResult> {
    console.log(`⚡ [BUSINESS RULE TRIGGERED] Regla activada: "${rule.name}" (${rule.actionType})`);

    const config = (typeof rule.actionConfig === 'object' && rule.actionConfig !== null
        ? rule.actionConfig
        : {}) as Record<string, any>;

    switch (rule.actionType) {
        case ActionType.TRANSFER_HUMAN:
            // Activar Handover en el contacto
            await prisma.contact.update({
                where: { id: contact.id },
                data: { isHandledByHuman: true },
            });
            console.log(`👤 [HANDOVER ACTIVADO] El contacto ${contact.phone} pasa a atención humana.`);
            return {
                triggered: true,
                ruleName: rule.name,
                actionType: rule.actionType,
                replyMessage: config.message || 'Te estamos transfiriendo con un asesor humano. En breve te atenderemos.',
            };

        case ActionType.SEND_CUSTOM_MESSAGE:
            return {
                triggered: true,
                ruleName: rule.name,
                actionType: rule.actionType,
                replyMessage: config.message || 'Gracias por tu mensaje.',
            };

        case ActionType.STOP_CONVERSATION:
            return {
                triggered: true,
                ruleName: rule.name,
                actionType: rule.actionType,
                replyMessage: undefined, // Silencio total / Bot pausado
            };

        default:
            return { triggered: false };
    }
}