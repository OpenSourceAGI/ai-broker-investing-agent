// Helper functions for positioning and dimensions

export function candlestickWidth(barSpacing: number, pixelRatio: number): number {
	const scaledBarSpacing = Math.min(
		Math.max(pixelRatio, barSpacing * pixelRatio),
		barSpacing * pixelRatio - pixelRatio
	);
	const width = Math.max(pixelRatio, Math.floor(scaledBarSpacing * 0.8));
	return width;
}

export function gridAndCrosshairMediaWidth(pixelRatio: number): number {
	return Math.max(1, Math.floor(pixelRatio));
}

export function positionsBox(
	top: number,
	bottom: number,
	pixelRatio: number
): { position: number; length: number } {
	const scaledTop = Math.round(top * pixelRatio);
	const scaledBottom = Math.round(bottom * pixelRatio);
	return {
		position: scaledTop,
		length: Math.max(scaledBottom - scaledTop, 1),
	};
}

export function positionsLine(
	center: number,
	pixelRatio: number,
	desiredWidthMedia: number = 1
): { position: number; length: number } {
	const scaledCenter = Math.round(center * pixelRatio);
	const scaledWidth = Math.max(1, Math.floor(desiredWidthMedia * pixelRatio));
	const half = (scaledWidth / 2);
	const left = scaledCenter - half;
	return {
		position: left,
		length: scaledWidth,
	};
}
