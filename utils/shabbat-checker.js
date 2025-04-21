const hebcal = require('hebcal');

// List of holidays when the website should be closed, with their start/end times
const CLOSED_HOLIDAYS = [
    {
        name: 'Rosh Hashana',
        startBuffer: true,  // Add buffer before start
        endBuffer: true     // Add buffer after end
    },
    {
        name: 'Yom Kippur',
        startBuffer: true,
        endBuffer: true
    },
    {
        name: 'Sukkot',
        startBuffer: true,
        endBuffer: true
    },
    {
        name: 'Shmini Atzeret',
        startBuffer: true,
        endBuffer: true
    },
    {
        name: 'Simchat Torah',
        startBuffer: true,
        endBuffer: true
    },
    {
        name: 'Pesach',
        startBuffer: true,
        endBuffer: true
    },
    {
        name: 'Shavuot',
        startBuffer: true,
        endBuffer: true
    }
];

function getClosureType() {
    const now = new Date();
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Get the current Hebrew date
    const hDate = new hebcal.HDate(now);
    
    // Check if today is a holiday when the website should be closed
    for (const holiday of CLOSED_HOLIDAYS) {
        try {
            const holidayDate = new hebcal.HolidayEvent(holiday.name, hDate.getFullYear());
            const holidayStart = new Date(holidayDate.getDate().greg());
            const holidayEnd = new Date(holidayStart);
            holidayEnd.setDate(holidayEnd.getDate() + 1); // Holiday ends at sunset the next day

            // Adjust start and end times with buffers if specified
            if (holiday.startBuffer) {
                holidayStart.setHours(holidayStart.getHours() - 1); // One hour before sunset
            }
            if (holiday.endBuffer) {
                holidayEnd.setHours(holidayEnd.getHours() + 1); // One hour after sunset
            }

            if (now >= holidayStart && now < holidayEnd) {
                return {
                    isClosed: true,
                    type: 'holiday',
                    name: holiday.name
                };
            }
        } catch (e) {
            continue;
        }
    }
    
    // Check if it's Friday after sunset or Saturday before sunset
    const isFriday = now.getDay() === 5; // 5 is Friday
    const isSaturday = now.getDay() === 6; // 6 is Saturday
    
    if (isFriday) {
        // Get sunset time for Friday and add one hour buffer
        const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
        const shabbatStart = new Date(sunset);
        shabbatStart.setHours(shabbatStart.getHours() - 1); // One hour before sunset
        
        if (now >= shabbatStart) {
            return {
                isClosed: true,
                type: 'shabbat'
            };
        }
    } else if (isSaturday) {
        // Get sunset time for Saturday and add one hour buffer
        const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
        const shabbatEnd = new Date(sunset);
        shabbatEnd.setHours(shabbatEnd.getHours() + 1); // One hour after sunset
        
        if (now < shabbatEnd) {
            return {
                isClosed: true,
                type: 'shabbat'
            };
        }
    }
    
    return {
        isClosed: false
    };
}

module.exports = getClosureType; 