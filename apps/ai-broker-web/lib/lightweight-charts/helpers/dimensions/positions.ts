export interface Position {
	position: number;
	length: number;
}

export function positionsLine(
	position: number,
	pixelRatio: number,
	desiredWidthMedia: number = 1
): Position {
	const width = Math.max(1, Math.floor(pixelRatio));
	const halfWidth = Math.round(width / 2);
	const positionMedia = position - halfWidth;
	const positionInBitmap = Math.round(positionMedia * pixelRatio);
	const desiredWidthInBitmap = Math.round(desiredWidthMedia * pixelRatio);
	return {
		position: positionInBitmap,
		length: desiredWidthInBitmap,
	};
}
