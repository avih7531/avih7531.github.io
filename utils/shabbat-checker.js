const hebcal = require('hebcal');

// List of holidays when the website should be closed
const CLOSED_HOLIDAYS = [
    'Rosh Hashana',
    'Yom Kippur',
    'Sukkot',
    'Shmini Atzeret',
    'Simchat Torah',
    'Pesach',
    'Shavuot'
];

function getClosureType() {
    const now = new Date();
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Get the current Hebrew date
    const hDate = new hebcal.HDate(now);
    
    // Check if today is a holiday when the website should be closed
    const currentHoliday = CLOSED_HOLIDAYS.find(holiday => {
        try {
            const holidayDate = new hebcal.HolidayEvent(holiday, hDate.getFullYear());
            return holidayDate.getDate().isSameDate(hDate);
        } catch (e) {
            return false;
        }
    });
    
    if (currentHoliday) {
        return {
            isClosed: true,
            type: 'holiday',
            name: currentHoliday
        };
    }
    
    // Check if it's Friday after sunset or Saturday before sunset
    const isFriday = now.getDay() === 5; // 5 is Friday
    const isSaturday = now.getDay() === 6; // 6 is Saturday
    
    if (isFriday) {
        // Get sunset time for Friday
        const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
        if (now >= sunset) {
            return {
                isClosed: true,
                type: 'shabbat'
            };
        }
    } else if (isSaturday) {
        // Get sunset time for Saturday
        const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
        if (now < sunset) {
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