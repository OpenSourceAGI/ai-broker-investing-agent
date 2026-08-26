/**
 * Seeking Alpha Utilities
 * Converted from Python OpenBB seeking_alpha helpers
 */

import { makeRequest } from '../../../utils/http';

export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  Connection: 'keep-alive',
};

/**
 * Map a ticker symbol to its Seeking Alpha ID
 */
export async function getSeekingAlphaId(symbol: string): Promise<string> {
  const url = 'https://seekingalpha.com/api/v3/searches';
  const params = {
    'filter[type]': 'symbols',
    'filter[list]': 'all',
    'page[size]': '100',
    'filter[query]': symbol,
  };

  const response = await makeRequest(url, {
    headers: HEADERS,
    params,
  });

  const ids = response.symbols;

  return ids && ids.length > 0 ? String(ids[0].id || '') : '';
}
