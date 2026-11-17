/**
 * The raw material of the demo's invented world (lib/demo/world): people who
 * do not exist, on streets that do not exist, in real towns.
 *
 * The rules are lib/sandbox's, kept here too: every email ends
 * @sandbox.invalid (reserved, can never resolve) and every phone number is in
 * Ofcom's drama range (07700 900xxx), so if something ever did send, it would
 * go nowhere. Names are kept in step with the Showroom's one sample story
 * (lib/showroom/content) where they overlap: 8 Recreation Terrace, Raj
 * Chauhan, Sophie Turner, Sam Whitaker.
 */

export type Town = { town: string; area: string; districts: number[]; lat: number; lng: number; scotland: boolean };

export const TOWNS: Town[] = [
  { town: "Nottingham", area: "NG", districts: [2, 3, 5, 7, 9], lat: 52.9548, lng: -1.1581, scotland: false },
  { town: "Leicester", area: "LE", districts: [2, 3, 4, 5], lat: 52.6369, lng: -1.1398, scotland: false },
  { town: "Derby", area: "DE", districts: [1, 22, 23], lat: 52.9225, lng: -1.4746, scotland: false },
  { town: "Edinburgh", area: "EH", districts: [6, 7, 9, 11], lat: 55.9533, lng: -3.1883, scotland: true },
  { town: "Glasgow", area: "G", districts: [11, 12, 20, 41], lat: 55.8642, lng: -4.2518, scotland: true },
];

export const STREETS = [
  "Recreation Terrace", "Alder Row", "Mill Gardens", "Foundry Lane", "Kestrel Close", "Orchard Rise", "Canal Wharf",
  "Thistle Court", "Lochside Avenue", "Brewhouse Yard", "Larkspur Road", "Tannery Walk", "Hawthorn Crescent",
  "Quarry Bank", "Weavers Row", "Saltmarsh Street", "Beacon Hill Road", "Juniper Way", "Cooper's Passage", "Rowan Bank",
];

/** [type, bedrooms, monthly rent in Nottingham terms]. Rents are scaled a little by town. */
export const HOME_KINDS: [string, number, number][] = [
  ["Flat", 1, 795], ["Flat", 2, 995], ["Terraced House", 2, 1050], ["Terraced House", 3, 1250],
  ["Semi-Detached House", 3, 1395], ["Flat", 2, 1150], ["Detached House", 4, 1850], ["Flat", 1, 850],
];

export const PHOTOS = [
  "/illustrations/app/home-terrace.webp", "/illustrations/app/home-redbrick.webp", "/illustrations/app/home-flats.webp",
  "/illustrations/app/home-modern.webp", "/illustrations/app/home-cottage.webp", "/illustrations/app/townhouse.webp",
  "/illustrations/app/home-bungalow.webp", "/brand/photo/property.jpg",
];
export const INSIDE_PHOTOS = ["/brand/living-room.jpg", "/illustrations/home/brick-loft-r05.webp"];

export const FIRST = [
  "Raj", "Sophie", "Amara", "Declan", "Mei", "Oluwaseun", "Hannah", "Tomasz", "Priya", "Callum", "Imogen", "Farid",
  "Bethan", "Kwame", "Niamh", "Luca", "Zainab", "Rhys", "Elena", "Jamal", "Freya", "Mateus", "Aisling", "Hugo",
  "Yasmin", "Gethin", "Ottilie", "Sanjay", "Morag", "Fergus", "Ingrid", "Dev",
];
export const LAST = [
  "Chauhan", "Turner", "Okafor", "Brennan", "Lin", "Adeyemi", "Whitlock", "Kowalczyk", "Nair", "Reid", "Hartley",
  "Rahimi", "Pryce", "Mensah", "Gallagher", "Ricci", "Hussain", "Bevan", "Marchetti", "Clarke", "Lindqvist", "Souza",
  "Byrne", "Fairweather", "Qureshi", "Lloyd", "Ashdown", "Patel", "Sinclair", "Drummond", "Halvorsen", "Mistry",
];

/** The demo's staff. The first is the Showroom's agent; "office" is the Showroom's office user. */
export const STAFF: { first: string; last: string; role: "agent" | "office" | "owner"; scotland: boolean; position: string }[] = [
  { first: "Sam", last: "Whitaker", role: "agent", scotland: false, position: "Lettings Agent" },
  { first: "Priya", last: "Anand", role: "agent", scotland: false, position: "Lettings Agent" },
  { first: "Tom", last: "Hadley", role: "agent", scotland: false, position: "Senior Lettings Agent" },
  { first: "Isla", last: "Fraser", role: "agent", scotland: true, position: "Lettings Agent" },
  { first: "Callum", last: "Muir", role: "agent", scotland: true, position: "Lettings Agent" },
  { first: "Jess", last: "Carter", role: "office", scotland: false, position: "Office Manager" },
  { first: "Dana", last: "Holt", role: "owner", scotland: false, position: "Managing Director" },
];

export const LEAD_SOURCES = ["Rightmove", "Zoopla", "OnTheMarket", "Website", "Direct"];
export const ENQUIRY_LINES = [
  "Is this still available? I can view any evening this week.",
  "We are a couple, both working full time, looking to move next month.",
  "Could you tell me if pets are considered? We have one small dog.",
  "I would like to book a viewing for Saturday morning if possible.",
  "Is there parking, and is the rent negotiable for a longer tenancy?",
  "I am relocating for work and can provide references straight away.",
];
