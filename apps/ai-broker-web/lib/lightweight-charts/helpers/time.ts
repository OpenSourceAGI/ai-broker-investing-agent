import { Time } from 'lightweight-charts';

export function convertTime(time: Time): Date {
	if (typeof time === 'string') {
		return new Date(Date.parse(time));
	}
	return new Date((time as number) * 1000);
}

export function formattedDateAndTime(date: Date | undefined): [string, string] {
	if (!date) {
		return ['', ''];
	}
	const dateString = date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
	const timeString = date.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
	return [dateString, timeString];
}
