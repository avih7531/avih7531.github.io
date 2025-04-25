const hebcal = require('hebcal');

// Add a compatibility layer to handle API differences
const getSunset = (date, timezone) => {
    try {
        // Try using the newer API (SunTimes.getSunset)
        if (hebcal.SunTimes && typeof hebcal.SunTimes.getSunset === 'function') {
            return hebcal.SunTimes.getSunset(date, timezone);
        }
        
        // Try using an older API if it exists
        if (hebcal.Zmanim && typeof hebcal.Zmanim.getSunset === 'function') {
            return hebcal.Zmanim.getSunset(date, timezone);
        }
        
        // No compatible API found, throw an error
        throw new Error('No compatible sunset calculation method found in hebcal');
    } catch (error) {
        console.error('Error in getSunset compatibility function:', error);
        
        // Fallback: Use approximate sunset time (around 6:00 PM)
        const fallbackSunset = new Date(date);
        fallbackSunset.setHours(18, 0, 0, 0);
        return fallbackSunset;
    }
};

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
            
            // Check if today matches the holiday date
            if (!holidayDate || !holidayDate.getDate()) {
                console.warn(`Could not get date for holiday: ${holiday.name}`);
                continue;
            }
            
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

            // Compare current date to holiday date
            const currentDate = now.toDateString();
            const holidayDateStr = holidayStart.toDateString();
            const holidayEndDateStr = holidayEnd.toDateString();
            
            if (currentDate === holidayDateStr || currentDate === holidayEndDateStr) {
                if (now >= holidayStart && now < holidayEnd) {
                    return {
                        isClosed: true,
                        type: 'holiday',
                        name: holiday.name
                    };
                }
            }
        } catch (e) {
            console.error(`Error checking holiday ${holiday.name}:`, e);
            continue;
        }
    }
    
    // Check if it's Friday after sunset or Saturday before sunset
    const isFriday = now.getDay() === 5; // 5 is Friday
    const isSaturday = now.getDay() === 6; // 6 is Saturday
    
    if (isFriday) {
        // Get sunset time for Friday and add one hour buffer
        try {
            const sunset = getSunset(now, userTimezone);
            const shabbatStart = new Date(sunset);
            shabbatStart.setHours(shabbatStart.getHours() - 1); // One hour before sunset
            
            if (now >= shabbatStart) {
                return {
                    isClosed: true,
                    type: 'shabbat'
                };
            }
        } catch (error) {
            console.error('Error calculating sunset time:', error);
            // Fallback: Use approximate sunset time (around 6:00 PM)
            const approxSunset = new Date(now);
            approxSunset.setHours(17, 0, 0, 0); // 5:00 PM (buffer hour included)
            
            if (now.getHours() >= 17) { // After 5 PM on Friday
                return {
                    isClosed: true,
                    type: 'shabbat'
                };
            }
        }
    } else if (isSaturday) {
        // Get sunset time for Saturday and add one hour buffer
        try {
            const sunset = getSunset(now, userTimezone);
            const shabbatEnd = new Date(sunset);
            shabbatEnd.setHours(shabbatEnd.getHours() + 1); // One hour after sunset
            
            if (now < shabbatEnd) {
                return {
                    isClosed: true,
                    type: 'shabbat'
                };
            }
        } catch (error) {
            console.error('Error calculating sunset time:', error);
            // Fallback: Use approximate sunset time (around 6:00 PM)
            const approxSunset = new Date(now);
            approxSunset.setHours(19, 0, 0, 0); // 7:00 PM (buffer hour included)
            
            if (now.getHours() < 19) { // Before 7 PM on Saturday
                return {
                    isClosed: true,
                    type: 'shabbat'
                };
            }
        }
    }
    
    return {
        isClosed: false
    };
}

module.exports = getClosureType; 