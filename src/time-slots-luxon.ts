import { DateTime } from "luxon"
import { _mergeOverlappingShiftsInAvailablePeriods } from "./config-management"
import { TimeSlotsFinderError } from "./errors"
import {
  Boundaries,
  Period,
  PeriodLuxon, PeriodMoment,
  Shift,
  TimeSlot,
  TimeSlotsFinderConfiguration,
  TimeSlotsFinderParameters,
} from "./types-luxon"

/**
 * Extract available time slots from a calendar. Take a configuration to precise rules used to
 * search availabilities. If the configuration provided is invalid, an error will be thrown.
 * @throws TimeSlotsFinderError
 * @param {TimeSlotsFinderParameters} params
 * @return {TimeSlot[]}
 */
export function getAvailableTimeSlots(params: TimeSlotsFinderParameters): TimeSlot[] {
	const { configuration, from, to } = params

	const usedConfig = _checkSearchParameters(configuration, from, to)
	const { unavailablePeriods, timeZone } = usedConfig

	const { firstFromMoment, lastToMoment } = _computeBoundaries(from, to, usedConfig)
	const unavailablePerDay = getUnavailablePeriodsPerDay(configuration, unavailablePeriods ?? [], timeZone, firstFromMoment, lastToMoment)

	const timeSlots: TimeSlot[] = []
	let fromMoment = firstFromMoment
	while (fromMoment < lastToMoment) {
		// Retrieve availablePeriods shifts for the given weekday
		const weekDayConfig = _getWeekDayConfigForMoment(usedConfig, fromMoment)
		if (weekDayConfig) {
			/* Go through each shift of the week day */
			weekDayConfig.shifts.forEach((shift: Shift) => {
				const { startAt, endAt } = _getMomentsFromShift(fromMoment, shift)
				/* Ensure that shift boundaries don't exceed global boundaries */
				const partialFrom = DateTime.max(firstFromMoment, startAt)
				const partialTo = DateTime.min(lastToMoment, endAt)
				if (partialFrom >= partialTo) {
					/* That may happen when shift boundaries exceed global ones */
					return
				}

				timeSlots.push(
					..._getAvailableTimeSlotsForShift(usedConfig, unavailablePerDay[partialFrom.toISODate() ?? ""] ?? [], partialFrom, partialTo)
				)
			})
		}
		/* Go one day forward: all shifts for this day has been processed (if any) */
		fromMoment = fromMoment.plus({ day: 1 }).startOf("day")
	}
	return timeSlots
}

function _checkSearchParameters(
	configuration: TimeSlotsFinderConfiguration,
	from: Date,
	to: Date,
): TimeSlotsFinderConfiguration {
	if (!from || !to || from.getTime() > to.getTime()) {
		throw new TimeSlotsFinderError("Invalid boundaries for the search")
	}

	let usedConfig = configuration
	try {
		const formattedPeriods = _mergeOverlappingShiftsInAvailablePeriods(
			configuration.availablePeriods
		)
		usedConfig = { ...configuration, availablePeriods: formattedPeriods }
	} catch (_) {
		/* If workedPeriods aren't formatted well and provoke an error, the validation will fail */
	}
	/* Don't go further if configuration is invalid */
	// isConfigurationValid(usedConfig)
	return usedConfig
}

function _computeBoundaries(from: Date, to: Date, configuration: TimeSlotsFinderConfiguration): Boundaries {
	const searchLimitMoment = configuration.maxDaysBeforeLastSlot
		? DateTime.local({ zone: configuration.timeZone })
			.plus({ day: configuration.maxDaysBeforeLastSlot })
			.endOf("day")
		: null

	const firstFromMoment = DateTime.max(
		DateTime.fromJSDate(from).setZone(configuration.timeZone),
		DateTime.local({ zone: configuration.timeZone })
			/* `minAvailableTimeBeforeSlot` will be subtract later and it cannot start before now */
			.plus({ minute: configuration.minAvailableTimeBeforeSlot ?? 0 })
			.plus({ minute :configuration.minTimeBeforeFirstSlot ?? 0 })
	).set({ second: 0, millisecond: 0 })
	const lastToMoment = searchLimitMoment
		? DateTime.min(DateTime.fromJSDate(to).setZone(configuration.timeZone), searchLimitMoment)
		: DateTime.fromJSDate(to).setZone(configuration.timeZone)

	return { firstFromMoment, lastToMoment }
}

function _getWeekDayConfigForMoment(
	configuration: TimeSlotsFinderConfiguration,
	searchMoment: DateTime,
) {
	return (
		configuration.availablePeriods.find((p) => p.isoWeekDay === searchMoment.weekday)
		|| null
	)
}

function _getMomentsFromShift(fromMoment: DateTime, shift: Shift): PeriodLuxon {
	const startAt = fromMoment.set({ hour: parseInt(shift.startTime.slice(0, 2), 10), minute: parseInt(shift.startTime.slice(3), 10) })
	const endAt = fromMoment.set({ hour: parseInt(shift.endTime.slice(0, 2), 10), minute: parseInt(shift.endTime.slice(3), 10) })
	return { startAt, endAt }
}

function fixDateObject(date: PeriodMoment): PeriodMoment {
	return { ...date, month: date.month + 1 }
}

function getUnavailablePeriodsPerDay(
	configuration: TimeSlotsFinderConfiguration,
	eventList: Period[],
	timeZone: string,
	from: DateTime,
	to: DateTime,
): Record<string, PeriodLuxon[]> {
	const minAvailableTimeBeforeSlot = configuration.minAvailableTimeBeforeSlot ?? 0
	const minAvailableTimeAfterSlot = configuration.timeSlotDuration
	+ (configuration.minAvailableTimeBeforeSlot ?? 0)
	/*
	 *  We can safely ignore calendar events outside from/to boundaries
	 *  We extend this boundaries to take in account minAvailableTimeBeforeSlot
	 */
	const filteringMin = from.minus({ minute: minAvailableTimeBeforeSlot})
	const filteringMax = to.plus({ minute: minAvailableTimeAfterSlot })

	return eventList
	  .sort((a,b) => DateTime.fromObject(fixDateObject(a.startAt)).valueOf() - DateTime.fromObject(fixDateObject(b.startAt)).valueOf())
	  .reduce((acc: Record<string, PeriodLuxon[]>, cur) => {
		const startAt = DateTime.fromObject(fixDateObject(cur.startAt)).setZone(timeZone)
		const endAt = DateTime.fromObject(fixDateObject(cur.endAt)).setZone(timeZone)
		const stringDate = startAt.toISODate()

		if (!stringDate || startAt > endAt || startAt > filteringMax || endAt < filteringMin) {
			return acc
		}
		if (!acc[stringDate]) {
			acc[stringDate] = []
		}
		acc[stringDate].push({ startAt, endAt })
		return acc
	}, {})
}

function _getAvailableTimeSlotsForShift(
	configuration: TimeSlotsFinderConfiguration,
	eventList: PeriodLuxon[],
	from: DateTime,
	to: DateTime,
) {
	const timeSlots: TimeSlot[] = []
	const minTimeWindowNeeded = _getMinTimeWindowNeeded(configuration)

	const minAvailableTimeBeforeSlot = configuration.minAvailableTimeBeforeSlot ?? 0
	const minAvailableTimeAfterSlot = configuration.timeSlotDuration
		+ (configuration.minAvailableTimeBeforeSlot ?? 0)

	// Ensures we preserve minAvailableTimeBeforeSlot before the first slot
	let searchMoment = from.minus({ minute: minAvailableTimeBeforeSlot })
	/*
	 *  Ensures we don't create an event that would finish after "to" boundary
	 *  or break minAvailableTimeBeforeSlot
	 */
	const searchEndMoment = to.minus({ minute: minAvailableTimeAfterSlot })

	/* Find index of the first event that is not yet ended at searchMoment */
	let eventIndex = eventList.findIndex((event) => event.endAt > searchMoment)
	// There is bug causing indefinite loop if period contains day-light saving change eg. 2025-10-26
	while (searchMoment <= searchEndMoment) {
		const focusedEvent: PeriodLuxon | null = (eventIndex >= 0 && eventList[eventIndex]) || null
		/* Adjust searchMoment according to the slotStartMinuteMultiple param */
		searchMoment = _nextSearchMoment(searchMoment, configuration)

		const freeTimeLimitMoment = searchMoment.plus({ minute: minTimeWindowNeeded })

		if (focusedEvent && focusedEvent.startAt < freeTimeLimitMoment) {
			/**
			 * If first event that is not yet ended start to soon to get a slot at this time,
			 * go directly to the end of the event for next search.
			 */
			searchMoment = focusedEvent.endAt
			if (focusedEvent) { eventIndex += 1 }
		} else {
			const { newSearchMoment, timeSlot } = _pushNewSlot(searchMoment, configuration)
			timeSlots.push(timeSlot)
			searchMoment = newSearchMoment
		}
	}
	return timeSlots
}

function _getMinTimeWindowNeeded(configuration :TimeSlotsFinderConfiguration) {
	return (
		(configuration.minAvailableTimeBeforeSlot ?? 0)
		+ configuration.timeSlotDuration
		+ (configuration.minAvailableTimeAfterSlot ?? 0)
	)
}

function _pushNewSlot(
	searchMoment: DateTime,
	configuration: TimeSlotsFinderConfiguration,
): { newSearchMoment: DateTime, timeSlot: TimeSlot } {
	const startAt = searchMoment
		.plus({ minute: configuration.minAvailableTimeBeforeSlot ?? 0 })
	const endAt = startAt.plus({ minute: configuration.timeSlotDuration })
	const timeSlot = {
		startAt: startAt.toJSDate(),
		endAt: endAt.toJSDate(),
		duration: endAt.diff(startAt, "minute").minutes,
	}
	/**
	 * We should start searching after just created slot (including free time after it) but before
	 * next one free time before it (since the search algorithm take it in account).
	 */
	const minutesBeforeNextSearch = Math.max(
		(configuration.minAvailableTimeAfterSlot ?? 0)
		- (configuration.minAvailableTimeBeforeSlot ?? 0),
		0
	)
	return {
		newSearchMoment: endAt
			.plus({ minute: minutesBeforeNextSearch }),
		timeSlot
	}
}

function _nextSearchMoment(moment: DateTime, configuration: TimeSlotsFinderConfiguration): DateTime {
	/* Round up to the next minute if second value is not 0 */
	const nextMoment = moment.second !== 0
		? moment.startOf("minute").plus({ minute: 1 })
		: moment
	const slotStartAt = nextMoment.plus({ minute: configuration.minAvailableTimeBeforeSlot ?? 0 })
	const slotStartMinuteStep = configuration.slotStartMinuteStep ?? 5
	const minuteToAdd = (
		slotStartMinuteStep - (slotStartAt.minute % slotStartMinuteStep)
	) % slotStartMinuteStep
	return nextMoment.plus({ minute: minuteToAdd }).set({ millisecond: 0 })
}
