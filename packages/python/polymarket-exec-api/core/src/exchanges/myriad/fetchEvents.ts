import axios, { AxiosInstance } from 'axios';
import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent } from '../../types';
import { BASE_URL, mapQuestionToEvent } from './utils';
import { myriadErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams, headers?: Record<string, string>, http: AxiosInstance = axios): Promise<UnifiedEvent[]> {
    try {
        if (params.eventId) {
            return await fetchQuestionById(params.eventId, headers, http);
        }

        if (params.slug) {
            return await fetchQuestionById(params.slug, headers, http);
        }

        const limit = params.limit || 100;
        const queryParams: any = {
            page: 1,
            limit: Math.min(limit, 100),
        };

        if (params.query) {
            queryParams.keyword = params.query;
        }

        const response = await http.get(`${BASE_URL}/questions`, {
            params: queryParams,
            headers,
        });

        const questions = response.data.data || response.data.questions || [];
        const events: UnifiedEvent[] = [];

        for (const q of questions) {
            const event = mapQuestionToEvent(q);
            if (event) events.push(event);
        }

        return events.slice(0, limit);
    } catch (error: any) {
        throw myriadErrorMapper.mapError(error);
    }
}

async function fetchQuestionById(id: string, headers: Record<string, string> | undefined, http: AxiosInstance): Promise<UnifiedEvent[]> {
    const response = await http.get(`${BASE_URL}/questions/${id}`, { headers });
    const question = response.data.data || response.data;
    const event = mapQuestionToEvent(question);
    return event ? [event] : [];
}
