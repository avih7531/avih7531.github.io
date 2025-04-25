const { HebrewCalendar, HDate, Location, Event, flags } = require('@hebcal/core');

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

// Map of common timezones to city coordinates (latitude, longitude)
const TIMEZONE_COORDS = {
    'America/New_York': { lat: 40.7128, lng: -74.0060, name: 'New York' },
    'America/Chicago': { lat: 41.8781, lng: -87.6298, name: 'Chicago' },
    'America/Los_Angeles': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' },
    'America/Denver': { lat: 39.7392, lng: -104.9903, name: 'Denver' },
    'America/Phoenix': { lat: 33.4484, lng: -112.0740, name: 'Phoenix' },
    'Europe/London': { lat: 51.5074, lng: -0.1278, name: 'London' },
    'Europe/Paris': { lat: 48.8566, lng: 2.3522, name: 'Paris' },
    'Europe/Berlin': { lat: 52.5200, lng: 13.4050, name: 'Berlin' },
    'Europe/Moscow': { lat: 55.7558, lng: 37.6173, name: 'Moscow' },
    'Asia/Jerusalem': { lat: 31.7683, lng: 35.2137, name: 'Jerusalem' },
    'Asia/Tel_Aviv': { lat: 32.0853, lng: 34.7818, name: 'Tel Aviv' },
    'Asia/Tokyo': { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
    'Australia/Sydney': { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
    'Pacific/Auckland': { lat: -36.8509, lng: 174.7645, name: 'Auckland' },
    // Default coordinates if timezone not found
    'default': { lat: 40.7128, lng: -74.0060, name: 'New York' } // Use New York as default
};

/**
 * Gets the user's timezone, with fallbacks for server environments
 * @returns {string} The timezone string
 */
function getUserTimezone() {
    try {
        // Try browser API first
        if (typeof Intl !== 'undefined' && 
            Intl.DateTimeFormat && 
            Intl.DateTimeFormat().resolvedOptions) {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
    } catch (e) {
        console.error('Error getting timezone from browser:', e);
    }

    // Fallback: Check environment variables that might have been set
    if (process.env.TZ) {
        return process.env.TZ;
    }
    
    // Last resort fallback
    return 'America/New_York';
}

/**
 * Check if today is actually Friday evening or Saturday
 * @returns {boolean} True if it's currently Shabbat
 */
function isActuallyShabbat() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
    const hours = now.getHours();
    
    // Check development/testing environment
    if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_SHABBAT === 'true') {
        return true;
    }
    
    // Friday after sunset (approximated as 6 PM / 18:00) or Saturday before havdalah (approximated as 8 PM / 20:00)
    // This is just a basic fallback if all other checks fail
    if ((dayOfWeek === 5 && hours >= 18) || (dayOfWeek === 6 && hours < 20)) {
        return true;
    }
    
    return false;
}

function getClosureType() {
    try {
        const now = new Date();
        
        // Get timezone with fallbacks for server environment
        const userTimezone = getUserTimezone();
                
        // If not obviously Shabbat, try the more precise method
        try {
            // Get coordinates for the user's timezone, or use default
            const coords = TIMEZONE_COORDS[userTimezone] || TIMEZONE_COORDS.default;
            
            // Create a location based on the timezone's city coordinates
            const location = new Location(
                coords.lat, 
                coords.lng, 
                false,
                userTimezone, 
                coords.name
            );
            
            // Get today's Hebrew date
            const hDate = new HDate(now);
            
            // Create options for HebrewCalendar
            const options = {
                start: now,
                end: now,
                location: location,
                candlelighting: true,
                havdalahMins: 42,
                sedrot: false,
                noMinorFast: true,
                noRoshChodesh: true,
                noSpecialShabbat: true,
                il: coords.name === 'Jerusalem' || coords.name === 'Tel Aviv',
            };
            
            // Get events for today
            const events = HebrewCalendar.calendar(options);
            
            // Check if today is a holiday when website should be closed
            for (const event of events) {
                const desc = event.getDesc();
                
                // Check if it's a major holiday
                if (CLOSED_HOLIDAYS.some(holiday => desc.includes(holiday))) {
                    return {
                        isClosed: true,
                        type: 'holiday',
                        name: desc
                    };
                }
                
                // Check if it's Shabbat (either Candle Lighting or Havdalah)
                if (event.getFlags() & flags.LIGHT_CANDLES || 
                    event.getFlags() & flags.LIGHT_CANDLES_TZEIS || 
                    desc === 'Havdalah') {
                    
                    const eventTime = event.eventTime;
                    
                    // If it's candle lighting event and it's after that time
                    if (desc.includes('Candle') && now > eventTime) {
                        return {
                            isClosed: true,
                            type: 'shabbat'
                        };
                    }
                    
                    // If it's Havdalah event and it's before that time, and it's Saturday
                    if (desc === 'Havdalah' && now < eventTime && now.getDay() === 6) {
                        return {
                            isClosed: true,
                            type: 'shabbat'
                        };
                    }
                    
                    // Otherwise, check if it's simply Saturday
                    if (hDate.getDay() === 6 && now.getHours() < 20) {
                        // Additional check - only if it's actually Saturday
                        if (now.getDay() === 6) {
                            return {
                                isClosed: true,
                                type: 'shabbat'
                            };
                        }
                    }
                }
            }
            
            // If there's a candle lighting event for today but it hasn't happened yet,
            // or there's no Havdalah event for today, we're not currently in Shabbat
            
        } catch (hebcalError) {
            console.error('Error in hebcal processing:', hebcalError);
            // Continue to fallback logic
        }
        
        // Fallback to simple check
        if (isActuallyShabbat()) {
            return {
                isClosed: true,
                type: 'shabbat'
            };
        }
        
        return {
            isClosed: false
        };
    } catch (error) {
        console.error('Error in getClosureType:', error);
        
        // Ultimate fallback - simple day of week check if anything fails
        if (isActuallyShabbat()) {
            return {
                isClosed: true,
                type: 'shabbat'
            };
        }
        
        return {
            isClosed: false
        };
    }
}

module.exports = getClosureType; 