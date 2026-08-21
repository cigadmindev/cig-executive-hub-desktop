// Curated list of SEC school towns and the biggest metro areas per SEC
// state — used so adding a location is "pick a city" instead of typing
// raw coordinates, which is both faster and immune to typos that were
// silently producing wrong or missing pins. Kept identical to mobile's
// copy (src/data/secCities.ts) since both apps write to the same
// customLocations collection — a city picked here should produce the
// exact same coordinates as picking it on mobile.

export const SEC_STATE_NAMES = {
  TX: 'Texas',
  OK: 'Oklahoma',
  AR: 'Arkansas',
  LA: 'Louisiana',
  MS: 'Mississippi',
  AL: 'Alabama',
  TN: 'Tennessee',
  KY: 'Kentucky',
  MO: 'Missouri',
  GA: 'Georgia',
  SC: 'South Carolina',
  FL: 'Florida',
};

export const SEC_CITIES = {
  TX: [
    { name: 'Austin', latitude: 30.2672, longitude: -97.7431 },
    { name: 'College Station', latitude: 30.6280, longitude: -96.3344 },
    { name: 'Houston', latitude: 29.7604, longitude: -95.3698 },
    { name: 'Dallas', latitude: 32.7767, longitude: -96.7970 },
    { name: 'San Antonio', latitude: 29.4241, longitude: -98.4936 },
    { name: 'Fort Worth', latitude: 32.7555, longitude: -97.3308 },
  ],
  OK: [
    { name: 'Norman', latitude: 35.2226, longitude: -97.4395 },
    { name: 'Oklahoma City', latitude: 35.4676, longitude: -97.5164 },
    { name: 'Tulsa', latitude: 36.1540, longitude: -95.9928 },
    { name: 'Stillwater', latitude: 36.1156, longitude: -97.0584 },
  ],
  AR: [
    { name: 'Fayetteville', latitude: 36.0626, longitude: -94.1574 },
    { name: 'Little Rock', latitude: 34.7465, longitude: -92.2896 },
  ],
  LA: [
    { name: 'Baton Rouge', latitude: 30.4515, longitude: -91.1871 },
    { name: 'New Orleans', latitude: 29.9511, longitude: -90.0715 },
    { name: 'Shreveport', latitude: 32.5252, longitude: -93.7502 },
  ],
  MS: [
    { name: 'Oxford', latitude: 34.3665, longitude: -89.5192 },
    { name: 'Starkville', latitude: 33.4504, longitude: -88.8184 },
    { name: 'Jackson', latitude: 32.2988, longitude: -90.1848 },
    { name: 'Hattiesburg', latitude: 31.3271, longitude: -89.2903 },
    { name: 'Ridgeland', latitude: 32.4304, longitude: -90.1476 },
  ],
  AL: [
    { name: 'Tuscaloosa', latitude: 33.2098, longitude: -87.5692 },
    { name: 'Auburn', latitude: 32.6099, longitude: -85.4808 },
    { name: 'Birmingham', latitude: 33.5186, longitude: -86.8104 },
    { name: 'Montgomery', latitude: 32.3792, longitude: -86.3077 },
    { name: 'Mobile', latitude: 30.6954, longitude: -88.0399 },
    { name: 'Huntsville', latitude: 34.7304, longitude: -86.5861 },
  ],
  TN: [
    { name: 'Knoxville', latitude: 35.9606, longitude: -83.9207 },
    { name: 'Nashville', latitude: 36.1627, longitude: -86.7816 },
    { name: 'Memphis', latitude: 35.1495, longitude: -90.0490 },
    { name: 'Chattanooga', latitude: 35.0456, longitude: -85.3097 },
  ],
  KY: [
    { name: 'Lexington', latitude: 38.0406, longitude: -84.5037 },
    { name: 'Louisville', latitude: 38.2527, longitude: -85.7585 },
    { name: 'Bowling Green', latitude: 36.9685, longitude: -86.4808 },
  ],
  MO: [
    { name: 'Columbia', latitude: 38.9517, longitude: -92.3341 },
    { name: 'St. Louis', latitude: 38.6270, longitude: -90.1994 },
    { name: 'Kansas City', latitude: 39.0997, longitude: -94.5786 },
    { name: 'Springfield', latitude: 37.2090, longitude: -93.2923 },
  ],
  GA: [
    { name: 'Athens', latitude: 33.9519, longitude: -83.3576 },
    { name: 'Atlanta', latitude: 33.7490, longitude: -84.3880 },
    { name: 'Augusta', latitude: 33.4735, longitude: -82.0105 },
    { name: 'Savannah', latitude: 32.0809, longitude: -81.0912 },
    { name: 'Columbus', latitude: 32.4610, longitude: -84.9877 },
    { name: 'Macon', latitude: 32.8407, longitude: -83.6324 },
  ],
  SC: [
    { name: 'Columbia', latitude: 34.0007, longitude: -81.0348 },
    { name: 'Clemson', latitude: 34.6834, longitude: -82.8374 },
    { name: 'Charleston', latitude: 32.7765, longitude: -79.9311 },
    { name: 'Greenville', latitude: 34.8526, longitude: -82.3940 },
  ],
  FL: [
    { name: 'Gainesville', latitude: 29.6516, longitude: -82.3248 },
    { name: 'Tallahassee', latitude: 30.4383, longitude: -84.2807 },
    { name: 'Miami', latitude: 25.7617, longitude: -80.1918 },
    { name: 'Orlando', latitude: 28.5383, longitude: -81.3792 },
    { name: 'Tampa', latitude: 27.9506, longitude: -82.4572 },
    { name: 'Jacksonville', latitude: 30.3322, longitude: -81.6557 },
  ],
};
