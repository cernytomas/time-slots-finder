import { getAvailableTimeSlots } from "../src"
import MockDate from "mockdate"
import iCalTestJSON from "./resources/calendar-ical.json"
import { TimeSlotsFinderError } from "../src/errors"
import { Period } from "../lib"
const jestConsole = console

const baseConfig = {
	timeSlotDuration: 15,
	availablePeriods: [{
		isoWeekDay: 5,
		shifts: [{ startTime: "10:00", endTime: "20:00" }]
	}],
	timeZone: "Europe/Paris",
}

describe("Time Slot Finder Luxon based", () => {
	beforeEach(() => {
	  MockDate.reset()
	  global.console = require('console')
	})
  afterEach(() => {
	global.console = jestConsole
  })
	afterAll(() => MockDate.reset())
	// This test is linked to _prepareEvents complexity (when filtering events)

	describe("speed test", () => {
		let unavailablePeriods: Period[] = []
		beforeEach(() => {
		  [3,4,5,10,11,2,17,18,19,24,25,26,30,31].forEach(d => {
			for (let h = 1; h<= 16 ;h++) {
			  unavailablePeriods.push({
				startAt: { year: 2025, month: 9, day: d, hour: h },
				endAt: { year: 2025, month: 9, day: d, hour: h, minute: 30 }
			  })
			}
		  })
		})

		it("should run fast on large calendar data set", () => {
			const start = Date.now()
			const slots = getAvailableTimeSlots({
				configuration: {
					timeZone: "Europe/Paris",
					timeSlotDuration: 15,
					unavailablePeriods,
					availablePeriods: [
						{
							isoWeekDay: 5,
							shifts: [
								{
									startTime: "00:00",
									endTime: "23:59"
								}
							]
						},
						{
							isoWeekDay: 6,
							shifts: [
								{
									startTime: "00:00",
									endTime: "23:59"
								}
							]
						},
						{
							isoWeekDay: 7,
							shifts: [
								{
									startTime: "00:00",
									endTime: "23:59"
								}
							]
						}
					]
				},
				from: new Date("2025-10-01T00:00:00.000+02:00"),
				to: new Date("2025-10-25T23:00:00.000+02:00")
			})
			const end = Date.now()
			// Results must be computing withing 1 sec (700ms on last test)
		  	console.log(end-start)
			expect(end - start).toBeLessThan(1000)
			expect(slots.length).toBe(722)
		})
	})

	it("should return slot with start minute '00' for 'from' in past", () => {
		MockDate.set(new Date("2023-05-03T07:13:36.123Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeZone: "Europe/Paris",
				timeSlotDuration: 60,
				availablePeriods: [
					{
						isoWeekDay: 3,
						shifts: [
							{
								startTime: "10:00",
								endTime: "11:00"
							}
						]
					}
				],
				slotStartMinuteStep: 1
			},
			from: new Date("2023-05-03T07:00:00.000Z"),
			to: new Date("2023-05-03T23:00:00.000Z")
		})
		expect(slots[0].startAt.toISOString()).toBe("2023-05-03T08:00:00.000Z")
	})

	it("should return slot with start minute '00' for 'from' in future with random time", () => {
		MockDate.set(new Date("2023-05-03T07:13:36.123Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeZone: "Europe/Paris",
				timeSlotDuration: 60,
				availablePeriods: [
					{
						isoWeekDay: 3,
						shifts: [
							{
								startTime: "10:00",
								endTime: "11:00"
							}
						]
					}
				],
				slotStartMinuteStep: 1
			},
			from: new Date("2023-05-03T08:12:34.567"),
			to: new Date("2023-05-03T23:00:00.000Z")
		})
		expect(slots[0].startAt.toISOString()).toBe("2023-05-03T08:00:00.000Z")
	})

	it("should return slots even without calendar data", () => {
		MockDate.set(new Date("2020-10-14T15:00:00.000Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 60,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T20:00:00.000Z"),
		})
		expect(slots.length).toBe(5)
	})
	it("should handle properly timeSlotDuration parameter", () => {
		MockDate.set(new Date("2020-10-14T15:00:00.000Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 45,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T20:00:00.000Z"),
		})
		slots.forEach((slot) => expect(slot.duration).toBe(45))
		const slots2 = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 15,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T20:00:00.000Z"),
		})
		slots2.forEach((slot) => expect(slot.duration).toBe(15))
	})
	it("should handle properly slotStartMinuteMultiple parameter", () => {
		MockDate.set(new Date("2020-10-15T15:03:12.592Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 10,
				slotStartMinuteStep: 5,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T16:00:00.000Z"),
		})
		expect(slots.length).toBe(5)
		expect(slots[0].startAt.toISOString()).toBe("2020-10-15T15:05:00.000Z")
		expect(slots[1].startAt.toISOString()).toBe("2020-10-15T15:15:00.000Z")
		expect(slots[2].startAt.toISOString()).toBe("2020-10-15T15:25:00.000Z")
		expect(slots[3].startAt.toISOString()).toBe("2020-10-15T15:35:00.000Z")
		expect(slots[4].startAt.toISOString()).toBe("2020-10-15T15:45:00.000Z")

		const slots2 = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 10,
				slotStartMinuteStep: 5,
				minAvailableTimeBeforeSlot: 2,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T16:00:00.000Z"),
		})
		expect(slots2.length).toBe(3)
		expect(slots2[0].startAt.toISOString()).toBe("2020-10-15T15:10:00.000Z")
		expect(slots2[1].startAt.toISOString()).toBe("2020-10-15T15:25:00.000Z")
		expect(slots2[2].startAt.toISOString()).toBe("2020-10-15T15:40:00.000Z")
		const slots3 = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 10,
				slotStartMinuteStep: 15,
				minAvailableTimeBeforeSlot: 5,
				minTimeBeforeFirstSlot: 45,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T16:00:00.000Z"),
			to: new Date("2020-10-15T17:00:00.000Z"),
		})
		expect(slots3.length).toBe(4)
		expect(slots3[0].startAt.toISOString()).toBe("2020-10-15T16:00:00.000Z")
		expect(slots3[1].startAt.toISOString()).toBe("2020-10-15T16:15:00.000Z")
		expect(slots3[2].startAt.toISOString()).toBe("2020-10-15T16:30:00.000Z")
		expect(slots3[3].startAt.toISOString()).toBe("2020-10-15T16:45:00.000Z")
	})
	it("should use 5 as default for slotStartMinuteMultiple parameter", () => {
		MockDate.set(new Date("2020-10-15T15:03:12.592Z"))
		const slots = getAvailableTimeSlots({
			configuration: {
				timeSlotDuration: 10,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "12:00", endTime: "22:00" }]
				}],
				timeZone: "Europe/Paris",
			},
			from: new Date("2020-10-15T15:00:00.000Z"),
			to: new Date("2020-10-15T16:00:00.000Z"),
		})
		expect(slots.length).toBe(5)
		expect(slots[0].startAt.toISOString()).toBe("2020-10-15T15:05:00.000Z")
		expect(slots[4].startAt.toISOString()).toBe("2020-10-15T15:45:00.000Z")
	})
	it("should handle properly minTimeBeforeFirstSlot parameter", () => {
		MockDate.set(new Date("2020-10-16T14:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				minTimeBeforeFirstSlot: 2 * 60,
			},
			from: new Date("2020-10-16T15:00:00.000+02:00"),
			to: new Date("2020-10-16T18:00:00.000+02:00"),
		})
		expect(slots.length).toBeGreaterThanOrEqual(1)
		expect(slots[0].startAt.toString())
			.toBe(new Date("2020-10-16T16:00:00.000+02:00").toString())
	})
	it("should handle properly maxDaysBeforeLastSlot parameter", () => {
		MockDate.set(new Date("2020-10-15T18:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				maxDaysBeforeLastSlot: 1,
			},
			from: new Date("2020-10-16T19:00:00.000+02:00"),
			to: new Date("2020-10-17T11:00:00.000+02:00"),
		})
		expect(slots.length).toBe(4)
		expect(slots[3].startAt.toString())
			.toBe(new Date("2020-10-16T19:45:00.000+02:00").toString())
	})
	it("should handle properly timeZone parameter", () => {
		MockDate.set(new Date("2020-10-15T18:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				timeZone: "UTC",
			},
			from: new Date("2020-10-16T20:00:00.000+02:00"),
			to: new Date("2020-10-16T23:00:00.000+02:00"),
		})
		expect(slots.length).toBe(8)
		expect(slots[7].startAt.toString())
			.toBe(new Date("2020-10-16T19:45:00.000Z").toString())
	})
	it("should handle properly availablePeriods parameter", () => {
		MockDate.set(new Date("2020-10-15T18:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				availablePeriods: [{
					isoWeekDay: 5,
					shifts: [
						{ startTime: "12:00", endTime: "13:00" },
						{ startTime: "15:00", endTime: "16:00" },
					]
				}]
			},
			from: new Date("2020-10-16T00:00:00.000+02:00"),
			to: new Date("2020-10-16T23:59:59.999+02:00"),
		})
		expect(slots.length).toBe(8)
		expect(slots[0].startAt.toString())
			.toBe(new Date("2020-10-16T12:00:00.000+02:00").toString())
		expect(slots[4].startAt.toString())
			.toBe(new Date("2020-10-16T15:00:00.000+02:00").toString())

		const slots2 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [
						{ startTime: "12:00", endTime: "13:00" },
						{ startTime: "15:00", endTime: "16:00" },
					]
				}]
			},
			from: new Date("2020-10-16T00:00:00.000+02:00"),
			to: new Date("2020-10-16T23:59:59.999+02:00"),
		})
		expect(slots2.length).toBe(0)
	})
	it("should handle properly unavailablePeriods parameter", () => {
		MockDate.set(new Date("2020-10-15T18:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				unavailablePeriods: [{
					startAt: { year: 2020, month: 9, day: 16, hour: 12, minute: 30 },
					endAt: { year: 2020, month: 9, day: 16, hour: 14, minute: 0 }
				}],
			},
			from: new Date("2020-10-16T11:30:00.000+02:00"),
			to: new Date("2020-10-16T15:00:00.000+02:00"),
		})
		expect(slots.length).toBe(8)
		expect(slots[0].startAt.toString())
			.toBe(new Date("2020-10-16T11:30:00.000+02:00").toString())
		expect(slots[3].endAt.toString())
			.toBe(new Date("2020-10-16T12:30:00.000+02:00").toString())
		expect(slots[4].startAt.toString())
			.toBe(new Date("2020-10-16T14:00:00.000+02:00").toString())
		expect(slots[7].startAt.toString())
			.toBe(new Date("2020-10-16T14:45:00.000+02:00").toString())

		const slots2 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				unavailablePeriods: [{
					startAt: { year: 2019, month: 9, day: 16, hour: 12, minute: 30 },
					endAt: { year: 2019, month: 9, day: 16, hour: 14, minute: 0 }
				}],
			},
			from: new Date("2020-10-16T11:30:00.000+02:00"),
			to: new Date("2020-10-16T15:00:00.000+02:00"),
		})
		expect(slots2.length).toBe(14)

		const slots3 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				unavailablePeriods: [{
					startAt: { month: 9, day: 16, hour: 12, minute: 30 },
					endAt: { month: 9, day: 16, hour: 14, minute: 0 }
				}],
			},
			from: new Date("2020-10-16T11:30:00.000+02:00"),
			to: new Date("2020-10-16T15:00:00.000+02:00"),
		})
		expect(slots3.length).toBe(8)
		expect(slots3[0].startAt.toString())
			.toBe(new Date("2020-10-16T11:30:00.000+02:00").toString())
		expect(slots3[7].startAt.toString())
			.toBe(new Date("2020-10-16T14:45:00.000+02:00").toString())

		const slots4 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				unavailablePeriods: [{
					startAt: { month: 9, day: 16, hour: 12, minute: 30 },
					endAt: { month: 9, day: 16, hour: 14 }
				}],
			},
			from: new Date("2020-10-16T12:15:00.000+02:00"),
			to: new Date("2020-10-16T15:00:00.000+02:00"),
		})
		expect(slots4.length).toBe(5)
		expect(slots4[0].startAt.toString())
			.toBe(new Date("2020-10-16T12:15:00.000+02:00").toString())
		expect(slots4[1].startAt.toString())
			.toBe(new Date("2020-10-16T14:00:00.000+02:00").toString())

		const slots5 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				availablePeriods: [{
					isoWeekDay: 4,
					shifts: [{ startTime: "10:00", endTime: "20:00" }]
				}, {
					isoWeekDay: 7,
					shifts: [{ startTime: "10:00", endTime: "20:00" }]
				}],
				unavailablePeriods: [{
					startAt: { month: 9, day: 16 },
					endAt: { month: 9, day: 17 }
				}],
			},
			from: new Date("2020-10-15T19:45:00.000+02:00"),
			to: new Date("2020-10-18T10:15:00.000+02:00"),
		})
		expect(slots5.length).toBe(2)
		expect(slots5[0].startAt.toString())
			.toBe(new Date("2020-10-15T19:45:00.000+02:00").toString())
		expect(slots5[1].startAt.toString())
			.toBe(new Date("2020-10-18T10:00:00.000+02:00").toString())

		const slots6 = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				unavailablePeriods: [{
					startAt: { year: 2020, month: 9, day: 16, hour: 16 },
					endAt: { year: 2020, month: 9, day: 16, hour: 17, minute: 30 }
				}],
			},
			from: new Date("2020-10-16T15:45:00.000+02:00"),
			to: new Date("2020-10-16T17:45:00.000+02:00"),
		})
		expect(slots6.length).toBe(2)
		expect(slots6[0].startAt.toString())
			.toBe(new Date("2020-10-16T15:45:00.000+02:00").toString())
		expect(slots6[1].startAt.toString())
			.toBe(new Date("2020-10-16T17:30:00.000+02:00").toString())
	})
	it("should throw for invalid from and/or to parameters", () => {
		expect(() => getAvailableTimeSlots({
			configuration: baseConfig,
			from: new Date("2020-10-16T18:30:00.000+02:00"),
			to: new Date("2020-10-16T15:00:00.000+02:00"),
		})).toThrowError(new TimeSlotsFinderError(("Invalid boundaries for the search")))
	})
	it(`should properly overlap minAvailableTimeBeforeSlot and minAvailableTimeAfterSlot`, () => {
		MockDate.set(new Date("2020-10-14T15:00:00.000+02:00"))
		const slots = getAvailableTimeSlots({
			configuration: {
				...baseConfig,
				minAvailableTimeBeforeSlot: 10,
				minAvailableTimeAfterSlot: 15,
			},
			from: new Date("2020-10-16T15:00:00.000+02:00"),
			to: new Date("2020-10-16T17:00:00.000+02:00"),
		})
		expect(slots.length).toBe(4)
		expect(slots[0].startAt.toString())
			.toBe(new Date("2020-10-16T15:00:00.000+02:00").toString())
		expect(slots[1].startAt.toString())
			.toBe(new Date("2020-10-16T15:30:00.000+02:00").toString())
		expect(slots[2].startAt.toString())
			.toBe(new Date("2020-10-16T16:00:00.000+02:00").toString())
		expect(slots[3].startAt.toString())
			.toBe(new Date("2020-10-16T16:30:00.000+02:00").toString())
	})
})
