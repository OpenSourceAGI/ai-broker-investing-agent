import { Time } from 'lightweight-charts';

export interface RoundedCandleSeriesData {
	time: Time;
	open: number;
	high: number;
	low: number;
	close: number;
}

export function isRoundedCandleData(
	data: unknown
): data is RoundedCandleSeriesData {
	const candleData = data as RoundedCandleSeriesData;
	return (
		candleData.open !== undefined &&
		candleData.high !== undefined &&
		candleData.low !== undefined &&
		candleData.close !== undefined
	);
}
