import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import { AuthenticationError, InsufficientFunds, InvalidOrder, BadRequest } from '../../errors';

export class ProbableErrorMapper extends ErrorMapper {
    constructor() {
        super('Probable');
    }

    protected extractErrorMessage(error: any): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            if (data.detail) {
                return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            }

            if (data.message) {
                return String(data.message);
            }

            if (data.error) {
                return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            }
        }

        // Handle @prob/clob SDK error objects
        if (error && typeof error === 'object' && error.msg) {
            return String(error.msg);
        }

        return super.extractErrorMessage(error);
    }

    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // SDK auth failures
        if (
            lowerMessage.includes('l1 auth') ||
            lowerMessage.includes('l2 auth') ||
            lowerMessage.includes('invalid api key') ||
            lowerMessage.includes('invalid signature') ||
            lowerMessage.includes('api key')
        ) {
            return new AuthenticationError(message, this.exchangeName);
        }

        // Insufficient funds
        if (
            lowerMessage.includes('insufficient') ||
            lowerMessage.includes('balance') ||
            lowerMessage.includes('not enough')
        ) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        // Invalid order params
        if (
            lowerMessage.includes('invalid order') ||
            lowerMessage.includes('tick size') ||
            lowerMessage.includes('price must') ||
            lowerMessage.includes('size must') ||
            lowerMessage.includes('amount must')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        return super.mapBadRequestError(message, data);
    }
}

export const probableErrorMapper = new ProbableErrorMapper();
