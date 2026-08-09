import {
	BitmapCoordinatesRenderingScope,
	CanvasRenderingTarget2D,
} from 'fancy-canvas';
import {
	ICustomSeriesPaneRenderer,
	PaneRendererCustomData,
	PriceToCoordinateConverter,
	Time,
} from 'lightweight-charts';
import { RoundedCandleSeriesData } from './data';
import { RoundedCandleSeriesOptions } from './rounded-candle-series';

interface BarItem {
	x: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

export class RoundedCandleSeriesRenderer<TData extends RoundedCandleSeriesData>
	implements ICustomSeriesPaneRenderer
{
	_data: PaneRendererCustomData<Time, TData> | null = null;
	_options: RoundedCandleSeriesOptions | null = null;

	draw(
		target: CanvasRenderingTarget2D,
		priceConverter: PriceToCoordinateConverter
	): void {
		target.useBitmapCoordinateSpace(scope =>
			this._drawImpl(scope, priceConverter)
		);
	}

	update(
		data: PaneRendererCustomData<Time, TData>,
		options: RoundedCandleSeriesOptions
	): void {
		this._data = data;
		this._options = options;
	}

	_drawImpl(
		renderingScope: BitmapCoordinatesRenderingScope,
		priceToCoordinate: PriceToCoordinateConverter
	): void {
		if (
			this._data === null ||
			this._data.bars.length === 0 ||
			this._data.visibleRange === null ||
			this._options === null
		) {
			return;
		}

		const options = this._options;
		const bars: BarItem[] = this._data.bars.map(bar => {
			return {
				x: bar.x,
				open: priceToCoordinate(bar.originalData.open as number)!,
				high: priceToCoordinate(bar.originalData.high as number)!,
				low: priceToCoordinate(bar.originalData.low as number)!,
				close: priceToCoordinate(bar.originalData.close as number)!,
			};
		});

		const radius = options.radius(this._data.barSpacing);
		this._drawWicks(renderingScope, bars, this._data.visibleRange, options);
		this._drawCandles(
			renderingScope,
			bars,
			this._data.visibleRange,
			this._data.barSpacing,
			radius,
			options
		);
	}

	_drawWicks(
		renderingScope: BitmapCoordinatesRenderingScope,
		bars: readonly BarItem[],
		visibleRange: { from: number; to: number },
		options: RoundedCandleSeriesOptions
	): void {
		if (!options.wickVisible) return;

		const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

		for (let i = visibleRange.from; i < visibleRange.to; i++) {
			const bar = bars[i];
			const isUp = bar.close <= bar.open;

			let color = options.wickColor;
			if (isUp) {
				color = options.wickUpColor;
			} else {
				color = options.wickDownColor;
			}

			ctx.fillStyle = color;
			const x = Math.round(bar.x * horizontalPixelRatio);
			const high = Math.round(bar.high * verticalPixelRatio);
			const low = Math.round(bar.low * verticalPixelRatio);
			const open = Math.round(bar.open * verticalPixelRatio);
			const close = Math.round(bar.close * verticalPixelRatio);

			// Upper wick
			ctx.fillRect(
				x,
				high,
				1 * horizontalPixelRatio,
				Math.max(1, Math.min(open, close) - high)
			);
			// Lower wick
			ctx.fillRect(
				x,
				Math.max(open, close),
				1 * horizontalPixelRatio,
				Math.max(1, low - Math.max(open, close))
			);
		}
	}

	_drawCandles(
		renderingScope: BitmapCoordinatesRenderingScope,
		bars: readonly BarItem[],
		visibleRange: { from: number; to: number },
		barSpacing: number,
		radius: number,
		options: RoundedCandleSeriesOptions
	): void {
		const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = renderingScope;

		for (let i = visibleRange.from; i < visibleRange.to; i++) {
			const bar = bars[i];
			const isUp = bar.close <= bar.open;

			let color = isUp ? options.upColor : options.downColor;

			const top = Math.min(bar.open, bar.close);
			const bottom = Math.max(bar.open, bar.close);
			const height = bottom - top;

			const width = Math.min(
				Math.max(horizontalPixelRatio, barSpacing * horizontalPixelRatio),
				barSpacing * horizontalPixelRatio - horizontalPixelRatio
			);
			const halfWidth = width / 2;

			const x = Math.round((bar.x - halfWidth / horizontalPixelRatio) * horizontalPixelRatio);
			const y = Math.round(top * verticalPixelRatio);
			const h = Math.max(1, Math.round(height * verticalPixelRatio));
			const r = Math.min(radius * verticalPixelRatio, h / 2, width / 2);

			ctx.beginPath();
			ctx.fillStyle = color;

			// Draw rounded rectangle for candle body
			if (r > 0) {
				ctx.moveTo(x + r, y);
				ctx.lineTo(x + width - r, y);
				ctx.arcTo(x + width, y, x + width, y + r, r);
				ctx.lineTo(x + width, y + h - r);
				ctx.arcTo(x + width, y + h, x + width - r, y + h, r);
				ctx.lineTo(x + r, y + h);
				ctx.arcTo(x, y + h, x, y + h - r, r);
				ctx.lineTo(x, y + r);
				ctx.arcTo(x, y, x + r, y, r);
			} else {
				// Fallback to regular rectangle if radius is 0
				ctx.rect(x, y, width, h);
			}

			ctx.fill();
		}
	}
}
