const hebcal = require('hebcal');

function isShabbat() {
  const now = new Date();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Get the current Hebrew date
  const hDate = new hebcal.HDate(now);
  
  // Check if it's Friday after sunset or Saturday before sunset
  const isFriday = now.getDay() === 5; // 5 is Friday
  const isSaturday = now.getDay() === 6; // 6 is Saturday
  
  if (isFriday) {
    // Get sunset time for Friday
    const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
    return now >= sunset;
  } else if (isSaturday) {
    // Get sunset time for Saturday
    const sunset = hebcal.SunTimes.getSunset(now, userTimezone);
    return now < sunset;
  }
  
  return false;
}

module.exports = isShabbat; 