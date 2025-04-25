const { HebrewCalendar, HDate, Location, Event, flags, CandleLightingEvent } = require('@hebcal/core');

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
    'default': { lat: 0, lng: 0, name: 'UTC' }
};

function getClosureType() {
    try {
        const now = new Date();
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log(`User timezone detected: ${userTimezone}`);
        
        // Get coordinates for the user's timezone, or use default if not found
        const coords = TIMEZONE_COORDS[userTimezone] || TIMEZONE_COORDS.default;
        console.log(`Using coordinates for ${coords.name}: ${coords.lat}, ${coords.lng}`);
        
        // Create a location based on the timezone's city coordinates
        const location = new Location(
            coords.lat, 
            coords.lng, 
            false, // Use elevation for more accurate times?
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
            sedrot: true,
            noMinorFast: false,
            noRoshChodesh: true,
            noSpecialShabbat: true,
            il: coords.name === 'Jerusalem' || coords.name === 'Tel Aviv', // Set to true if in Israel
        };
        
        // Get events for today
        const events = HebrewCalendar.calendar(options);
        console.log(`Found ${events.length} events for today`);
        
        // Check for candle lighting directly
        let candleLightingEvent = null;
        
        for (const event of events) {
            console.log(`Checking event: ${event.getDesc()}`);
            
            // Check if event is an instance of CandleLightingEvent
            if (event instanceof CandleLightingEvent) {
                console.log('Found candle lighting event!');
                candleLightingEvent = event;
            }
            
            // Check if it's a major holiday
            if (CLOSED_HOLIDAYS.some(holiday => event.getDesc().includes(holiday))) {
                console.log(`Holiday detected: ${event.getDesc()}`);
                return {
                    isClosed: true,
                    type: 'holiday',
                    name: event.getDesc()
                };
            }
            
            // Check if it's Shabbat related
            if (event.getFlags() & flags.LIGHT_CANDLES || 
                event.getFlags() & flags.LIGHT_CANDLES_TZEIS || 
                event.getDesc() === 'Havdalah') {
                
                console.log(`Shabbat event detected: ${event.getDesc()}`);
                
                const eventTime = event.eventTime;
                const isAfterCandleLighting = event.getDesc().includes('Candle') && now > eventTime;
                const isBeforeHavdalah = event.getDesc() === 'Havdalah' && now < eventTime;
                
                if (isAfterCandleLighting || isBeforeHavdalah || (hDate.getDay() === 6)) {
                    console.log('Currently during Shabbat');
                    return {
                        isClosed: true,
                        type: 'shabbat'
                    };
                }
            }
        }
        
        // Double check if it's Shabbat based on candle lighting event timing
        if (candleLightingEvent) {
            const candleTime = candleLightingEvent.eventTime;
            const now = new Date();
            
            // Check if we're after candle lighting
            if (now > candleTime) {
                // Check if it's still Friday or early Saturday
                const day = now.getDay();
                if (day === 5 || (day === 6 && now.getHours() < 19)) {
                    console.log('After candle lighting time, before Shabbat ends');
                    return {
                        isClosed: true,
                        type: 'shabbat'
                    };
                }
            }
        }
        
        // Fallback Check: Check if it's Shabbat based on day of week 
        const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
        const hours = now.getHours();
        
        // Friday after 4 PM (16:00) or Saturday before 7 PM (19:00)
        if ((dayOfWeek === 5 && hours >= 16) || (dayOfWeek === 6 && hours < 19)) {
            console.log('Fallback: Likely Shabbat based on day and hour');
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
        
        // Fallback to basic day-of-week check if anything fails
        const now = new Date();
        const dayOfWeek = now.getDay();
        const hours = now.getHours();
        
        if ((dayOfWeek === 5 && hours >= 16) || (dayOfWeek === 6 && hours < 19)) {
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