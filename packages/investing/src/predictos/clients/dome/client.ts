/**
 * Base HTTP client for Dome API
 * @see https://docs.domeapi.io/
 */

const DOME_API_BASE_URL = 'https://api.domeapi.io/v1';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Gets the Dome API key from environment variables
 */
function getApiKey(): string {
  const apiKey = process.env.DOME_API_KEY;
  if (!apiKey) {
    throw new Error('DOME_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Makes a request to the Dome API
 * @param endpoint The API endpoint (e.g., '/polymarket/markets')
 * @param options Request options including method, headers, and params
 * @returns Promise resolving to the parsed JSON response
 */
export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, params = {} } = options;

  // Build query string from params
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const queryString = queryParams.toString();
  const url = `${DOME_API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      ...headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Dome API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return (await response.json()) as T;
}
