/**
 * Randomised content pools for the Task 2 scenario generator and the demo seed
 * data. Kept large and varied so repeated attempts never look alike.
 */

export const FIRST_NAMES = [
  'Jennifer', 'Marcus', 'Priya', 'Daniel', 'Katherine', 'Rajesh', 'Amanda', 'Olumide',
  'Christopher', 'Meera', 'Gregory', 'Sofia', 'Nathaniel', 'Aisha', 'Vincent', 'Lakshmi',
  'Patricia', 'Terrence', 'Yolanda', 'Bradley', 'Chandrika', 'Douglas', 'Elena', 'Farhan',
  'Gabriela', 'Harrison', 'Ingrid', 'Jasmine', 'Kwame', 'Lorenzo', 'Michelle', 'Nikolai',
  'Ophelia', 'Preston', 'Quentin', 'Rosalind', 'Stephanie', 'Thaddeus', 'Ursula', 'Valeria',
  'Wesley', 'Ximena', 'Yusuf', 'Zachary', 'Anushka', 'Bernard', 'Clarissa', 'Dimitri',
]

export const LAST_NAMES = [
  'Anderson', 'Whitfield', 'Krishnamurthy', 'O’Donnell', 'Vasquez', 'Adeyemi', 'Nakamura',
  'Fitzgerald', 'Balasubramanian', 'Montgomery', 'Chowdhury', 'Sutherland', 'Delacroix',
  'Okonkwo', 'Petrossian', 'Hendricks', 'Ramaswamy', 'Blackwood', 'Castellanos', 'Thornton',
  'Villanueva', 'Abernathy', 'Kowalski', 'Rasmussen', 'Barrington', 'Ferreira', 'Nguyen',
  'Ashworth', 'Dominguez', 'Lindqvist', 'Mbeki', 'Pemberton', 'Sandoval', 'Tremblay',
  'Underwood', 'Wojcik', 'Yamashita', 'Zielinski', 'Bhattacharya', 'Colquitt', 'Estrada',
]

export const PROVIDERS = [
  'North Valley Medical Center',
  'Meridian Regional Hospital',
  'Crestline Orthopedic Associates',
  'Summit Ridge Family Practice',
  'Lakeshore Diagnostic Imaging',
  'Copperfield Surgical Institute',
  'Brookhaven Cardiology Group',
  'Silverleaf Behavioral Health',
  'Windermere Rehabilitation Center',
  'Fairmont Community Clinic',
  'Harborview Specialty Physicians',
  'Cedar Point Urgent Care',
  'Greenfield Pediatric Associates',
  'Stonebridge Neurology Partners',
]

export const PLAN_NAMES = [
  'Choice Plus PPO',
  'Select Advantage HMO',
  'Premier EPO 2000',
  'National Preferred POS',
  'Essential Care Bronze',
  'Signature Gold PPO',
  'Value Network HMO 1500',
  'Comprehensive Silver Plus',
]

export const ID_PREFIXES = ['UHC', 'BCB', 'AET', 'CIG', 'HUM', 'MOL', 'AMB', 'WEL']
export const STATE_CODES = ['TX', 'AZ', 'FL', 'NC', 'GA', 'OH', 'CO', 'NV']

export const COPAY_VALUES = [20, 30, 40, 50, 75]
export const SPECIALIST_COPAY_VALUES = [40, 50, 60, 75, 90]
export const DEDUCTIBLE_VALUES = [500, 750, 1000, 1500, 1750, 2000, 3000]
export const OOP_MAX_VALUES = [3500, 4500, 6850, 8150, 9200, 12400]
export const COINSURANCE_VALUES = ['10%', '20%', '30%', '40%']
export const NETWORK_STATUSES = ['In Network', 'Out of Network']

export const BATCHES = [
  'AIO-2026-B1',
  'AIO-2026-B2',
  'AIO-2026-B3',
  'AIO-2026-B4',
  'RCM-2026-A1',
]

export const LOCATIONS = [
  'Hyderabad',
  'Bengaluru',
  'Chennai',
  'Pune',
  'Noida',
  'Mumbai',
  'Kochi',
]

export const TRAINERS = [
  'Akhilesh Rao',
  'Sanjana Iyer',
  'Vikram Menon',
  'Deepika Shetty',
]

/** NATO phonetic alphabet used by the level 4/5 script generator. */
export const PHONETIC: Record<string, string> = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
  G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima',
  M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
  S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
}

/** Conversational connective tissue so the audio does not read like a database row. */
export const FILLER_LINES = [
  'Let me pull that record up for you.',
  'One moment while I verify that on my side.',
  'Okay, I have the account open now.',
  'Thanks for holding, I appreciate your patience.',
  'I am reading directly from the eligibility screen.',
  'Let me go ahead and confirm the rest of the benefits.',
  'Bear with me, the system is a little slow this morning.',
  'Alright, I can see the full plan detail here.',
]

export const INTRO_LINES = [
  'Thank you for calling provider services, this is the benefits desk.',
  'Thanks for holding. I have the eligibility record in front of me now.',
  'Good afternoon, I can help you with that verification today.',
  'Thank you for waiting. Let me read out the member details for you.',
]

export const OUTRO_LINES = [
  'That covers everything on this account. Is there anything else you need?',
  'That is the complete verification for today. Thank you for calling.',
  'And that completes the benefit detail on file. Have a good day.',
  'That is everything I show on the record. Thanks for your time.',
]
